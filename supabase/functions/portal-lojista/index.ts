import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigins = (Deno.env.get("PORTAL_LOJISTA_ALLOWED_ORIGINS") ?? "")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const allowLocalOrigins = Deno.env.get("PORTAL_LOJISTA_ALLOW_LOCAL_ORIGINS") === "true";

if (!supabaseUrl || !serviceRoleKey || allowedOrigins.length === 0) {
  throw new Error("Configuracao obrigatoria do Portal do Lojista ausente.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function isAllowedOrigin(origin: string | null) {
  if (!origin) return false;
  if (allowedOrigins.includes(origin)) return true;
  if (!allowLocalOrigins) return false;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}

function headers(origin: string | null): HeadersInit {
  const cors = isAllowedOrigin(origin) ? {
    "Access-Control-Allow-Origin": origin as string,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  } : { "Vary": "Origin" };
  return { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Pragma": "no-cache", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
}

function reply(body: Record<string, unknown>, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

async function consumeLimit(key: string, limit: number) {
  const { data, error } = await supabase.rpc("consumir_limite_portal", {
    p_chave: key, p_limite: limit, p_janela_segundos: 60,
  });
  return !error && data === true;
}

function money(value: unknown) { return Number(value || 0); }

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return reply({ error: "origem_nao_autorizada" }, 403, origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (request.method !== "POST") return reply({ error: "metodo_nao_permitido" }, 405, origin);

  try {
    const payload = await request.json();
    if (!validToken(payload?.token)) return reply({ error: "link_invalido" }, 400, origin);

    const tokenHash = await sha256Hex(payload.token);
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const clientKey = await sha256Hex(`ip:${forwardedFor || "indisponivel"}`);
    if (!await consumeLimit(clientKey, 60)) return reply({ error: "limite_de_requisicoes" }, 429, origin);

    const { data: token, error: tokenError } = await supabase
      .from("portal_estabelecimento_tokens")
      .select("id, estabelecimento_id, ativo, expira_em, revogado_em, pausado_em")
      .eq("token_hash", tokenHash).maybeSingle();
    if (tokenError || !token) return reply({ error: "link_invalido" }, 404, origin);
    if (!token.ativo || token.revogado_em) return reply({ error: "link_revogado" }, 403, origin);
    if (token.pausado_em) return reply({ error: "link_pausado" }, 403, origin);
    if (token.expira_em && new Date(token.expira_em).getTime() <= Date.now()) return reply({ error: "link_expirado" }, 403, origin);
    if (!await consumeLimit(tokenHash, 20)) return reply({ error: "limite_de_requisicoes" }, 429, origin);

    const { data: establishment, error: establishmentError } = await supabase
      .from("estabelecimentos").select("id, nome, ativo").eq("id", token.estabelecimento_id).maybeSingle();
    if (establishmentError || !establishment || !establishment.ativo) return reply({ error: "link_indisponivel" }, 403, origin);

    const { data: balances, error: balancesError } = await supabase
      .from("consignacao_saldos").select("variacao_id, quantidade, atualizado_em")
      .eq("estabelecimento_id", establishment.id).gt("quantidade", 0).order("atualizado_em", { ascending: false });
    const { data: conferences, error: conferencesError } = await supabase
      .from("consignacao_conferencias").select("id, data_visita, confirmada_em")
      .eq("estabelecimento_id", establishment.id).order("data_visita", { ascending: false }).limit(100);
    const { data: closures, error: closuresError } = await supabase
      .from("consignacao_fechamentos").select("id, valor_bruto, valor_comissao, valor_liquido, total_pago, saldo_pendente, status, criado_em")
      .eq("estabelecimento_id", establishment.id).order("criado_em", { ascending: false }).limit(100);
    if (balancesError || conferencesError || closuresError) return reply({ error: "consulta_indisponivel" }, 500, origin);

    const balanceVariationIds = [...new Set([...(balances || []).map((row) => row.variacao_id)])];
    const conferenceIds = (conferences || []).map((row) => row.id);
    const closureIds = (closures || []).map((row) => row.id);
    const [itemsResult, paymentsResult] = await Promise.all([
      conferenceIds.length ? supabase.from("consignacao_conferencia_itens").select("conferencia_id, variacao_id, quantidade_vendida, preco_unitario, comissao_percentual").in("conferencia_id", conferenceIds) : Promise.resolve({ data: [], error: null }),
      closureIds.length ? supabase.from("consignacao_pagamentos").select("fechamento_id, data_pagamento, valor, forma_pagamento, registrado_em").in("fechamento_id", closureIds).order("data_pagamento", { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null }),
    ]);
    if (itemsResult.error || paymentsResult.error) return reply({ error: "consulta_indisponivel" }, 500, origin);
    const variationIds = [...new Set([...balanceVariationIds, ...(itemsResult.data || []).map((row) => row.variacao_id)])];
    const variationsResult = variationIds.length
      ? await supabase.from("produto_variacoes").select("id, produto_id, nome, modelo, sku, cor, tamanho, variacao_padrao").in("id", variationIds)
      : { data: [], error: null };
    if (variationsResult.error) return reply({ error: "consulta_indisponivel" }, 500, origin);
    const variations = variationsResult.data || [];
    const productIds = [...new Set(variations.map((row) => row.produto_id))];
    const productsResult = productIds.length
      ? await supabase.from("produtos").select("id, nome").in("id", productIds)
      : { data: [], error: null };
    if (productsResult.error) return reply({ error: "consulta_indisponivel" }, 500, origin);

    const productById = new Map((productsResult.data || []).map((row) => [row.id, row]));
    const variationById = new Map(variations.map((row) => [row.id, row]));
    const labelFor = (variationId: string) => {
      const variation = variationById.get(variationId);
      const product = variation ? productById.get(variation.produto_id) : null;
      return { produto: product?.nome || "Produto indisponível", variacao: variation?.variacao_padrao ? "Padrão" : variation?.nome || [variation?.cor, variation?.tamanho].filter(Boolean).join(" / ") || variation?.modelo || variation?.sku || "Padrão", sku: variation?.sku || null };
    };
    const items = itemsResult.data || [];
    const conferencesView = (conferences || []).map((conference) => {
      const lines = items.filter((item) => item.conferencia_id === conference.id);
      const bruto = lines.reduce((sum, item) => sum + money(item.quantidade_vendida) * money(item.preco_unitario), 0);
      const comissao = lines.reduce((sum, item) => sum + money(item.quantidade_vendida) * money(item.preco_unitario) * money(item.comissao_percentual) / 100, 0);
      return { data_visita: conference.data_visita, confirmada_em: conference.confirmada_em, unidades_vendidas: lines.reduce((sum, item) => sum + Number(item.quantidade_vendida || 0), 0), valor_bruto: bruto, valor_comissao: comissao, valor_liquido: bruto - comissao };
    });
    const sales = items.filter((item) => Number(item.quantidade_vendida) > 0).map((item) => {
      const conference = (conferences || []).find((row) => row.id === item.conferencia_id);
      const bruto = Number(item.quantidade_vendida) * money(item.preco_unitario);
      const comissao = bruto * money(item.comissao_percentual) / 100;
      return { data: conference?.data_visita || null, ...labelFor(item.variacao_id), quantidade: item.quantidade_vendida, valor_bruto: bruto, valor_comissao: comissao, valor_liquido: bruto - comissao };
    });
    const stock = (balances || []).map((balance) => ({ ...labelFor(balance.variacao_id), quantidade: balance.quantidade, atualizado_em: balance.atualizado_em }));
    const payments = (paymentsResult.data || []).map((payment) => ({ data_pagamento: payment.data_pagamento, valor: money(payment.valor), forma_pagamento: payment.forma_pagamento, registrado_em: payment.registrado_em }));
    const commercialTotals = conferencesView.reduce((total, row) => ({ valor_bruto: total.valor_bruto + row.valor_bruto, valor_comissao: total.valor_comissao + row.valor_comissao, valor_liquido: total.valor_liquido + row.valor_liquido }), { valor_bruto: 0, valor_comissao: 0, valor_liquido: 0 });
    const summary = { produtos_disponiveis: stock.length, unidades_disponiveis: stock.reduce((sum, row) => sum + Number(row.quantidade || 0), 0), ...commercialTotals };
    await supabase.from("portal_estabelecimento_tokens").update({ ultimo_acesso_em: new Date().toISOString() }).eq("id", token.id);
    return reply({ estabelecimento: { nome: establishment.nome }, resumo: summary, estoque: stock, conferencias: conferencesView, vendas: sales, fechamentos: (closures || []).map(({ id: _id, ...closure }) => closure), pagamentos: payments }, 200, origin);
  } catch {
    return reply({ error: "consulta_indisponivel" }, 500, origin);
  }
});
