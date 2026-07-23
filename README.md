# Bússola — Orientação financeira pessoal

App financeiro pessoal com régua 50/30/20, importação de PDF, ativos/patrimônio e
notificações push de contas a vencer. PWA instalável no iPhone e Android.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + TanStack Router + Tailwind CSS
- **Backend**: Supabase (Postgres + Auth + Edge Functions + pg_cron)
- **Push**: Web Push API + VAPID
- **Deploy**: Vercel ou Netlify

## Setup

```bash
# 1. Clone e instale
npm install

# 2. Configure variáveis de ambiente
cp .env.example .env
# Preencha VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_VAPID_PUBLIC_KEY

# 3. Rode o SQL no Supabase
# supabase/migrations/001_schema.sql

# 4. Dev
npm run dev

# 5. Build
npm run build
```

## Páginas

- `/` — Visão geral (dashboard com resumo mensal)
- `/importar` — Importar despesas via PDF
- `/ativos` — Ativos e patrimônio
- `/metas` — Metas 50/30/20
- `/admin` — Painel admin (templates e disparos de notificação)
- `/auth` — Login / Cadastro

## Edge Function: parse-pdf

Requer secret `ANTHROPIC_API_KEY` configurado no Supabase:

```bash
# Via Supabase CLI
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# Deploy da função
supabase functions deploy parse-pdf --no-verify-jwt
```

A função recebe o PDF em base64, chama `claude-sonnet-4-6` e retorna
transações categorizadas. Suporta revalidação com aprendizado por correções
do usuário.

## Páginas

- `/` — Dashboard (resumo do mês com dados reais)
- `/importar` — Importar PDF com Claude AI + correção iterativa
- `/ativos` — CRUD de ativos e patrimônio
- `/metas` — Metas 50/30/20 editáveis
- `/admin` — Templates e disparos de notificação (admin only)
- `/auth` — Login + Google OAuth
