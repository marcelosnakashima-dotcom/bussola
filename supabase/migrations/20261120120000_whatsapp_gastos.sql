-- Gastos pelo WhatsApp (Z-API).
-- NÃO APLICADA. Revisar e executar em produção pelo chat de trabalho, ANTES de publicar a
-- função whatsapp-webhook e o front que chama as RPCs abaixo.
--
-- Modelo de segurança:
-- - O número só vira "ativo" quando o PRÓPRIO WhatsApp envia o código de 6 dígitos que o
--   usuário gerou logado no app. Isso prova as duas coisas: dono da conta e dono do número.
-- - O household e o usuário de cada lançamento vêm do vínculo, nunca do texto da mensagem.
-- - Tabelas de mensagens e rascunhos não têm policy para o app: só a função do webhook
--   (service_role) mexe nelas, sempre por RPCs com escopo explícito.
-- - Conteúdo das mensagens não é guardado; só o id do provedor (idempotência) e metadados.
--
-- Rollback (sem lançamentos de origem 'whatsapp' gravados):
--   drop function public.whatsapp_iniciar_vinculo(text);
--   drop function public.whatsapp_meu_vinculo();
--   drop function public.whatsapp_revogar();
--   drop function public.whatsapp_verificar_codigo(text[], text);
--   drop function public.whatsapp_confirmar(uuid);
--   drop function public.whatsapp_desfazer(uuid);
--   drop table public.whatsapp_rascunhos; drop table public.whatsapp_mensagens; drop table public.whatsapp_links;
--   e recriar transactions_origem_check sem 'whatsapp'.

begin;

-- 1. Nova origem de lançamento
alter table public.transactions drop constraint transactions_origem_check;
alter table public.transactions add constraint transactions_origem_check
  check (origem in ('manual', 'pdf', 'ofx', 'whatsapp'));

-- 2. Vínculo número <-> usuário
create table public.whatsapp_links (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  household_id    uuid not null references public.households(id) on delete cascade,
  phone           text not null check (phone ~ '^55[1-9][1-9]9[0-9]{8}$'),
  status          text not null default 'pendente' check (status in ('pendente', 'ativo', 'revogado')),
  code_hash       text,
  code_expires_at timestamptz,
  code_attempts   integer not null default 0,
  created_at      timestamptz not null default now(),
  verified_at     timestamptz,
  revoked_at      timestamptz
);
-- um número ativo só pode pertencer a uma conta; um usuário tem no máximo um vínculo aberto
create unique index whatsapp_links_phone_ativo on public.whatsapp_links(phone) where status = 'ativo';
create unique index whatsapp_links_user_aberto on public.whatsapp_links(user_id) where status in ('pendente', 'ativo');
alter table public.whatsapp_links enable row level security;
-- sem policies: o app usa as RPCs abaixo (o hash do código nunca sai do banco)

-- 3. Mensagens recebidas (idempotência e limite de uso; sem conteúdo)
create table public.whatsapp_mensagens (
  id                  uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  phone               text not null,
  link_id             uuid references public.whatsapp_links(id) on delete set null,
  kind                text not null check (kind in ('text', 'audio', 'image')),
  status              text not null default 'recebida',
  created_at          timestamptz not null default now()
);
create index whatsapp_mensagens_phone_tempo on public.whatsapp_mensagens(phone, created_at desc);
alter table public.whatsapp_mensagens enable row level security;

-- 4. Rascunhos aguardando confirmação
create table public.whatsapp_rascunhos (
  id             uuid primary key default gen_random_uuid(),
  link_id        uuid not null references public.whatsapp_links(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  household_id   uuid not null references public.households(id) on delete cascade,
  tipo           text not null check (tipo in ('despesa', 'receita')),
  valor          numeric(12, 2) not null check (valor > 0 and valor <= 1000000),
  descricao      text not null check (char_length(descricao) between 1 and 120),
  data           date not null,
  categoria_id   text references public.categories(id),
  fonte          text not null check (fonte in ('text', 'audio', 'image')),
  status         text not null default 'aguardando' check (status in ('aguardando', 'confirmado', 'cancelado', 'expirado', 'desfeito')),
  expires_at     timestamptz not null default now() + interval '30 minutes',
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  check (tipo = 'despesa' or categoria_id is null)
);
create unique index whatsapp_rascunhos_um_aberto on public.whatsapp_rascunhos(link_id) where status = 'aguardando';
alter table public.whatsapp_rascunhos enable row level security;

-- ─── RPCs do app (usuário logado) ──────────────────────────────────────────

-- Gera o código de 6 dígitos (15 min) para o número informado. Revoga vínculo anterior do usuário.
create or replace function public.whatsapp_iniciar_vinculo(p_phone text)
returns table (codigo text, expira_em timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid := public.my_household_id();
  v_code text;
  v_id uuid;
begin
  if v_user is null or v_household is null then raise exception 'sessão sem household'; end if;
  if p_phone !~ '^55[1-9][1-9]9[0-9]{8}$' then raise exception 'telefone inválido'; end if;
  if exists (select 1 from public.whatsapp_links where phone = p_phone and status = 'ativo' and user_id <> v_user) then
    raise exception 'este número já está vinculado a outra conta';
  end if;

  update public.whatsapp_links set status = 'revogado', revoked_at = now(), code_hash = null
   where user_id = v_user and status in ('pendente', 'ativo');

  v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
  insert into public.whatsapp_links (user_id, household_id, phone, code_expires_at)
  values (v_user, v_household, p_phone, now() + interval '15 minutes')
  returning id into v_id;
  update public.whatsapp_links
     set code_hash = encode(extensions.digest(v_code || ':' || v_id::text, 'sha256'), 'hex')
   where id = v_id;

  return query select v_code, now() + interval '15 minutes';
end $$;

-- Situação do vínculo do usuário logado (sem o hash).
create or replace function public.whatsapp_meu_vinculo()
returns table (phone text, status text, verified_at timestamptz, code_expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select l.phone, l.status, l.verified_at, l.code_expires_at
    from public.whatsapp_links l
   where l.user_id = auth.uid() and l.status in ('pendente', 'ativo')
   order by l.created_at desc
   limit 1
$$;

create or replace function public.whatsapp_revogar()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.whatsapp_links set status = 'revogado', revoked_at = now(), code_hash = null
   where user_id = auth.uid() and status in ('pendente', 'ativo');
  get diagnostics n = row_count;
  return n;
end $$;

-- ─── RPCs do webhook (somente service_role) ────────────────────────────────

-- Confere o código enviado pelo próprio número. Até 5 tentativas por código.
create or replace function public.whatsapp_verificar_codigo(p_phones text[], p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare l public.whatsapp_links;
begin
  if p_code !~ '^[0-9]{6}$' then return null; end if;
  select * into l from public.whatsapp_links
   where phone = any(p_phones) and status = 'pendente' and code_expires_at > now() and code_attempts < 5
   order by created_at desc limit 1
   for update;
  if not found then return null; end if;

  if l.code_hash <> encode(extensions.digest(p_code || ':' || l.id::text, 'sha256'), 'hex') then
    update public.whatsapp_links set code_attempts = code_attempts + 1 where id = l.id;
    return null;
  end if;

  update public.whatsapp_links
     set status = 'ativo', verified_at = now(), code_hash = null, code_expires_at = null
   where id = l.id;
  return l.id;
end $$;

-- Grava o lançamento do rascunho, uma única vez (trava a linha; idempotente).
create or replace function public.whatsapp_confirmar(p_rascunho uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare r public.whatsapp_rascunhos; v_tx uuid;
begin
  select * into r from public.whatsapp_rascunhos where id = p_rascunho for update;
  if not found or r.status <> 'aguardando' then return null; end if;
  if r.expires_at <= now() then
    update public.whatsapp_rascunhos set status = 'expirado', decided_at = now() where id = r.id;
    return null;
  end if;
  -- o vínculo precisa continuar ativo e no mesmo household
  perform 1 from public.whatsapp_links
   where id = r.link_id and status = 'ativo' and household_id = r.household_id and user_id = r.user_id;
  if not found then return null; end if;

  insert into public.transactions (user_id, household_id, data, descricao, categoria_id, tipo, valor, origem, status, confianca)
  values (r.user_id, r.household_id, r.data, r.descricao, r.categoria_id, r.tipo, r.valor, 'whatsapp', 'confirmada', 'alta')
  returning id into v_tx;

  update public.whatsapp_rascunhos set status = 'confirmado', decided_at = now(), transaction_id = v_tx where id = r.id;
  return v_tx;
end $$;

-- Apaga o último lançamento confirmado por este vínculo nas últimas 24 h.
create or replace function public.whatsapp_desfazer(p_link uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare r public.whatsapp_rascunhos; v_tx uuid;
begin
  select * into r from public.whatsapp_rascunhos
   where link_id = p_link and status = 'confirmado' and transaction_id is not null
     and decided_at > now() - interval '24 hours'
   order by decided_at desc limit 1
   for update;
  if not found then return null; end if;
  v_tx := r.transaction_id;
  delete from public.transactions where id = v_tx and household_id = r.household_id and origem = 'whatsapp';
  update public.whatsapp_rascunhos set status = 'desfeito', transaction_id = null where id = r.id;
  return v_tx;
end $$;

revoke all on function public.whatsapp_iniciar_vinculo(text) from public, anon;
revoke all on function public.whatsapp_meu_vinculo() from public, anon;
revoke all on function public.whatsapp_revogar() from public, anon;
grant execute on function public.whatsapp_iniciar_vinculo(text) to authenticated;
grant execute on function public.whatsapp_meu_vinculo() to authenticated;
grant execute on function public.whatsapp_revogar() to authenticated;

revoke all on function public.whatsapp_verificar_codigo(text[], text) from public, anon, authenticated;
revoke all on function public.whatsapp_confirmar(uuid) from public, anon, authenticated;
revoke all on function public.whatsapp_desfazer(uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_verificar_codigo(text[], text) to service_role;
grant execute on function public.whatsapp_confirmar(uuid) to service_role;
grant execute on function public.whatsapp_desfazer(uuid) to service_role;

commit;
