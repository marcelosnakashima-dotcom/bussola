// supabase/functions/create-client-access/index.ts
// Deploy: supabase functions deploy create-client-access
// Secrets necessários:
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → automáticos
//
// Cria uma conta de acesso (e-mail + senha) para um cliente novo.
// Só pode ser chamada por um usuário autenticado com role 'admin' em user_roles.
// O e-mail já entra confirmado (não depende de fluxo de confirmação por e-mail).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function randomPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  try {
    // 1. Identifica quem está chamando a partir do token da sessão
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Não autenticado." }, 401);

    const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !callerData?.user) return json({ error: "Sessão inválida." }, 401);

    // 2. Confere se quem está chamando é admin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerData.user.id)
      .maybeSingle();

    if (roleRow?.role !== "admin") {
      return json({ error: "Apenas administradores podem criar acessos." }, 403);
    }

    // 3. Cria o usuário
    const body = await req.json() as { email?: string; nome?: string; senha?: string };
    if (!body.email) return json({ error: "E-mail é obrigatório." }, 400);

    const senha = body.senha && body.senha.length >= 8 ? body.senha : randomPassword();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: senha,
      email_confirm: true,
      user_metadata: body.nome ? { full_name: body.nome } : undefined,
    });

    if (createErr) return json({ error: createErr.message }, 400);

    return json({
      user_id: created.user?.id,
      email: created.user?.email,
      senha,
    });
  } catch (err) {
    return json({ error: (err as Error).message ?? "Erro interno" }, 500);
  }
});
