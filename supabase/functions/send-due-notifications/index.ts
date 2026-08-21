// supabase/functions/send-due-notifications/index.ts  (versão 3)
// Agora suporta:
// 1. Cron diário (contas a vencer) — igual à v2 (mode ausente ou 'daily')
// 2. Disparo manual de admin_notifications pendentes (roda sempre)
// 3. Cron semanal (resumo do que vence nos próximos 7 dias) — mode 'weekly'
// 4. Cron mensal (fechamento do mês anterior) — mode 'monthly'
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@bussola.app";
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── helpers ───────────────────────────────────────────────
function clampDay(y: number, m: number, d: number) {
  return Math.min(d, new Date(y, m + 1, 0).getDate());
}
function nextDueDate(dueDay: number, today: Date): Date {
  let y = today.getFullYear(), m = today.getMonth();
  let due = new Date(y, m, clampDay(y, m, dueDay));
  if (due < today) {
    m += 1; if (m > 11) { m = 0; y++; }
    due = new Date(y, m, clampDay(y, m, dueDay));
  }
  return due;
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
function toDateOnly(d: Date) { return d.toISOString().slice(0, 10); }
function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function sendPush(
  userId: string | null,
  title: string,
  body: string
): Promise<{ sent: number; removed: number }> {
  let query = supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (userId) query = query.eq("user_id", userId);

  const { data: subs } = await query;
  if (!subs?.length) return { sent: 0, removed: 0 };

  let sent = 0, removed = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body })
      );
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        removed++;
      }
    }
  }
  return { sent, removed };
}

// ─── 1. Processar admin_notifications pendentes ────────────
async function processAdminNotifications() {
  const now = new Date().toISOString();
  const { data: pending } = await supabase
    .from("admin_notifications")
    .select("*, notification_templates(title, body)")
    .eq("status", "pending")
    .lte("send_at", now);

  if (!pending?.length) return 0;

  let totalSent = 0;
  for (const notif of pending) {
    const title = notif.title_override ?? notif.notification_templates?.title ?? "Bússola";
    const body  = notif.body_override  ?? notif.notification_templates?.body  ?? "";

    const { sent } = await sendPush(notif.target_user_id ?? null, title, body);
    totalSent += sent;

    await supabase
      .from("admin_notifications")
      .update({ status: "sent", sent_at: new Date().toISOString(), total_sent: sent })
      .eq("id", notif.id);
  }
  return totalSent;
}

// ─── 2. Cron diário: contas a vencer (lógica original) ─────
async function processBillReminders(): Promise<number> {
  const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("user_id, enabled, lead_days")
    .eq("enabled", true);

  let notified = 0;
  for (const s of settings ?? []) {
    const { data: expenses } = await supabase
      .from("recurring_expenses")
      .select("id, description, category, amount, due_day")
      .eq("user_id", s.user_id).eq("active", true);
    if (!expenses?.length) continue;

    const due = expenses
      .map(e => ({ ...e, nextDue: nextDueDate(e.due_day, todayMid) }))
      .map(e => ({ ...e, daysUntil: daysBetween(todayMid, e.nextDue) }))
      .filter(e => e.daysUntil <= s.lead_days)
      .sort((a, b) => a.daysUntil - b.daysUntil);
    if (!due.length) continue;

    const pending = [];
    for (const e of due) {
      const notifiedFor = toDateOnly(e.nextDue);
      const { data: log } = await supabase.from("notification_log")
        .select("id").eq("expense_id", e.id).eq("notified_for", notifiedFor).maybeSingle();
      if (!log) pending.push({ ...e, notifiedFor });
    }
    if (!pending.length) continue;

    const { data: subs } = await supabase
      .from("push_subscriptions").select("id, endpoint, p256dh, auth")
      .eq("user_id", s.user_id);
    if (!subs?.length) continue;

    const first = pending[0];
    const title = "Bússola — contas a vencer";
    const body = pending.length === 1
      ? `${first.description}: ${first.daysUntil <= 0 ? "vence hoje" : `vence em ${first.daysUntil} dia(s)`} — ${formatBRL(first.amount)}`
      : `${pending.length} contas vencendo nos próximos ${s.lead_days} dias.`;

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body })
        );
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }
    for (const e of pending) {
      await supabase.from("notification_log")
        .insert({ expense_id: e.id, notified_for: e.notifiedFor });
    }
    notified += pending.length;
  }
  return notified;
}

// ─── 3. Cron semanal: resumo das contas que vencem em 7 dias
async function processWeeklyDigest(): Promise<number> {
  const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("user_id, enabled")
    .eq("enabled", true);

  let notified = 0;
  for (const s of settings ?? []) {
    const { data: expenses } = await supabase
      .from("recurring_expenses")
      .select("id, description, amount, due_day")
      .eq("user_id", s.user_id).eq("active", true);
    if (!expenses?.length) continue;

    const upcoming = expenses
      .map(e => ({ ...e, nextDue: nextDueDate(e.due_day, todayMid) }))
      .map(e => ({ ...e, daysUntil: daysBetween(todayMid, e.nextDue) }))
      .filter(e => e.daysUntil >= 0 && e.daysUntil <= 7)
      .sort((a, b) => a.daysUntil - b.daysUntil);
    if (!upcoming.length) continue;

    const total = upcoming.reduce((sum, e) => sum + Number(e.amount), 0);
    const title = "Bússola — resumo da semana";
    const body = upcoming.length === 1
      ? `1 conta essa semana: ${upcoming[0].description} — ${formatBRL(upcoming[0].amount)}`
      : `${upcoming.length} contas essa semana, totalizando ${formatBRL(total)}.`;

    const { sent } = await sendPush(s.user_id, title, body);
    if (sent > 0) notified++;
  }
  return notified;
}

// ─── 4. Cron mensal: fechamento do mês anterior ────────────
async function processMonthlyReport(): Promise<number> {
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const start = toDateOnly(firstOfLastMonth);
  const end = toDateOnly(firstOfThisMonth);

  const { data: settings } = await supabase
    .from("notification_settings")
    .select("user_id, enabled")
    .eq("enabled", true);

  let notified = 0;
  for (const s of settings ?? []) {
    const { data: txs } = await supabase
      .from("transactions")
      .select("valor")
      .eq("user_id", s.user_id)
      .eq("tipo", "despesa")
      .gte("data", start)
      .lt("data", end);

    if (!txs?.length) continue;
    const total = txs.reduce((sum, t) => sum + Number(t.valor), 0);

    const monthLabel = firstOfLastMonth.toLocaleDateString("pt-BR", { month: "long" });
    const title = "Bússola — fechamento do mês";
    const body = `Em ${monthLabel}, você gastou ${formatBRL(total)} em ${txs.length} lançamento(s).`;

    const { sent } = await sendPush(s.user_id, title, body);
    if (sent > 0) notified++;
  }
  return notified;
}

// ─── Handler principal ─────────────────────────────────────
Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET)
    return new Response("unauthorized", { status: 401 });

  let mode = "daily";
  try {
    const payload = await req.json();
    if (payload?.mode) mode = payload.mode;
  } catch {
    // sem body ou body vazio: segue com o modo diário padrão


  if (mode === "weekly") {
    const weeklyNotified = await processWeeklyDigest();
    return new Response(
      JSON.stringify({ ok: true, mode, admin_sent: adminSent, weekly_notified: weeklyNotified }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (mode === "monthly") {
    const monthlyNotified = await processMonthlyReport();
    return new Response(
      JSON.stringify({ ok: true, mode, admin_sent: adminSent, monthly_notified: monthlyNotified }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  const billNotified = await processBillReminders();
  return new Response(
    JSON.stringify({ ok: true, mode, admin_sent: adminSent, bill_notified: billNotified }),
    { headers: { "Content-Type": "application/json" } }
  );
});
