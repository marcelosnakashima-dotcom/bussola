// supabase/functions/create-client-access/index.ts
// Cria uma conta de acesso (e-mail + senha) para um cliente novo.
// So pode ser chamada por um usuario autenticado com role 'admin' em user_roles.
// O e-mail ja entra confirmado (nao depende de fluxo de confirmacao por e-mail).
// A conta e criada com a flag must_change_password: true, que obriga o
// cliente a trocar a senha no primeiro login (ver ForcePasswordChangePage).

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
    // 1. Identifica quem esta chamando a partir do token da sessao
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Nao autenticado." }, 401);

    const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !callerData?.user) return json({ error: "Sessao invalida." }, 401);

    // 2. Confere se quem esta chamando e admin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerData.user.id)
      .maybeSingle();

    if (roleRow?.role !== "admin") {
      return json({ error: "Apenas administradores podem criar acessos." }, 403);
    }

    // 3. Cria o usuario
    const body = await req.json() as { email?: string; nome?: string; senha?: string };
    if (!body.email) return json({ error: "E-mail e obrigatorio." }, 400);

    const senha = body.senha && body.senha.length >= 8 ? body.senha : randomPassword();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: senha,
      email_confirm: true,
      user_metadata: {
        ...(body.nome ? { full_name: body.nome } : {}),
        must_change_password: true,
      },
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
