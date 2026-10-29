import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigins = (Deno.env.get("PORTAL_ADMIN_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configurados.");
}

if (allowedOrigins.length === 0) {
  throw new Error("PORTAL_ADMIN_ALLOWED_ORIGINS deve conter ao menos uma origem autorizada.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Action = "gerar" | "substituir" | "revogar" | "status" | "pausar" | "reativar";

type RequestPayload = {
  action?: Action;
  estabelecimento_id?: string;
  expira_em?: string | null;
};

function isAction(value: unknown): value is Action {
  return ["gerar", "substituir", "revogar", "status", "pausar", "reativar"].includes(value as Action);
}

function corsHeaders(origin: string | null): HeadersInit {
  if (!origin || !allowedOrigins.includes(origin)) {
    return { "Vary": "Origin" };
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function response(body: Record<string, unknown>, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function uuidIsValid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseExpiration(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("invalid_expiration");

  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    throw new Error("invalid_expiration");
  }
  return date.toISOString();
}

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requireAdministrator(authorization: string | null) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(match[1]);
  if (userError || !userData.user) return null;

  const { data: role, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (roleError || role?.role !== "admin") return null;
  return userData.user;
}

async function getOwnedEstablishment(administratorId: string, establishmentId: string) {
  const { data, error } = await supabase
    .from("estabelecimentos")
    .select("id, nome, ativo")
    .eq("id", establishmentId)
    .eq("user_id", administratorId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

function tokenStatus(token: {
  ativo: boolean;
  expira_em: string | null;
  revogado_em: string | null;
  pausado_em: string | null;
} | null): "SEM_LINK" | "ATIVO" | "PAUSADO" | "EXPIRADO" | "REVOGADO" {
  if (!token) return "SEM_LINK";
  if (!token.ativo || token.revogado_em) return "REVOGADO";
  if (token.expira_em && new Date(token.expira_em).getTime() <= Date.now()) return "EXPIRADO";
  if (token.pausado_em) return "PAUSADO";
  return "ATIVO";
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins.includes(origin)) {
    return response({ error: "Origem nao autorizada." }, 403, origin);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return response({ error: "Metodo nao permitido." }, 405, origin);
  }

  const administrator = await requireAdministrator(request.headers.get("Authorization"));
  if (!administrator) {
    return response({ error: "Autenticacao administrativa obrigatoria." }, 401, origin);
  }

  let payload: RequestPayload;
  try {
    payload = await request.json();
  } catch {
    return response({ error: "Corpo da requisicao invalido." }, 400, origin);
  }

  if (!payload || !isAction(payload.action) || !uuidIsValid(payload.estabelecimento_id)) {
    return response({ error: "Dados da requisicao invalidos." }, 400, origin);
  }

  const action = payload.action;

  const establishment = await getOwnedEstablishment(administrator.id, payload.estabelecimento_id);
  if (!establishment) {
    return response({ error: "Estabelecimento indisponivel." }, 404, origin);
  }

  if (action === "status") {
    const { data: token, error } = await supabase
      .from("portal_estabelecimento_tokens")
      .select("id, ativo, criado_em, expira_em, revogado_em, pausado_em, ultimo_acesso_em")
      .eq("estabelecimento_id", establishment.id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return response({ error: "Nao foi possivel consultar o acesso." }, 500, origin);

    return response({
      estabelecimento: { id: establishment.id, nome: establishment.nome, ativo: establishment.ativo },
      acesso: token
        ? {
          status: tokenStatus(token),
          criado_em: token.criado_em,
          expira_em: token.expira_em,
          revogado_em: token.revogado_em,
          pausado_em: token.pausado_em,
          ultimo_acesso_em: token.ultimo_acesso_em,
        }
        : { status: "SEM_LINK" },
    }, 200, origin);
  }

  if (action === "gerar" || action === "substituir") {
    let expiration: string | null;
    try {
      expiration = parseExpiration(payload.expira_em);
    } catch {
      return response({ error: "Data de expiracao invalida." }, 400, origin);
    }

    const token = generateToken();
    const tokenHash = await sha256Hex(token);
    const { data, error } = await supabase.rpc("substituir_token_portal_estabelecimento", {
      p_admin_user_id: administrator.id,
      p_estabelecimento_id: establishment.id,
      p_token_hash: tokenHash,
      p_expira_em: expiration,
    });
    if (error) return response({ error: "Nao foi possivel gerar o link de acesso." }, 400, origin);

    return response({
      estabelecimento_id: establishment.id,
      token,
      expira_em: data?.expira_em ?? expiration,
    }, 200, origin);
  }

  const rpcByAction: Record<Exclude<Action, "gerar" | "substituir" | "status">, string> = {
    revogar: "revogar_token_portal_estabelecimento",
    pausar: "pausar_token_portal_estabelecimento",
    reativar: "reativar_token_portal_estabelecimento",
  };
  const { data, error } = await supabase.rpc(rpcByAction[action], {
    p_admin_user_id: administrator.id,
    p_estabelecimento_id: establishment.id,
  });
  if (error) return response({ error: "Nao foi possivel atualizar o acesso." }, 400, origin);

  return response({
    estabelecimento_id: establishment.id,
    ...((data ?? {}) as Record<string, unknown>),
  }, 200, origin);
});
