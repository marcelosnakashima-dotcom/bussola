// supabase/functions/send-due-notifications/index.ts  (versão 2)
// Agora suporta:
// 1. Cron diário (contas a vencer) — igual à v1
// 2. Disparo manual de admin_notifications pendentes
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

// ─── 2. Cron: contas a vencer (lógica original) ───────────
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

// ─── Handler principal ─────────────────────────────────────
Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== CRON_SECRET)
    return new Response("unauthorized", { status: 401 });

  const [adminSent, billNotified] = await Promise.all([
    processAdminNotifications(),
    processBillReminders(),
  ]);

  return new Response(
    JSON.stringify({ ok: true, admin_sent: adminSent, bill_notified: billNotified }),
    { headers: { "Content-Type": "application/json" } }
  );
});
