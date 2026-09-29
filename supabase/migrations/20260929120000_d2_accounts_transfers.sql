-- D2: contas e transferências
-- JÁ APLICADA EM PRODUÇÃO em 29/09/2026. Não reexecutar.
-- Aditiva: nenhuma linha existente foi alterada.
--
-- Antes desta migração foi criado um backup fora da API:
--   create schema backup_20260929;
--   create table backup_20260929.transactions   as table public.transactions;
--   create table backup_20260929.import_batches as table public.import_batches;
--   (RLS ativa nas duas tabelas de backup; sem acesso para anon/authenticated)

begin;

-- 1. Contas e cartões por household
create table public.accounts (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  instituicao   text not null,
  apelido       text not null,
  tipo          text not null check (tipo in ('corrente','poupanca','investimento','cartao','outro')),
  final         text check (final is null or final ~ '^[0-9]{3,6}$'),
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint accounts_id_household_key unique (id, household_id)
);
create index accounts_household on public.accounts(household_id);
alter table public.accounts enable row level security;
create policy "manage household accounts" on public.accounts
  for all to authenticated
  using (household_id = my_household_id())
  with check (household_id = my_household_id());

-- 2. Transações: conta, lote, transferência, id externo (FITID)
alter table public.transactions
  add column account_id       uuid,
  add column import_batch_id  uuid references public.import_batches(id) on delete set null,
  add column transfer_kind    text,
  add column transfer_pair_id uuid,
  add column external_id      text;

-- a conta precisa ser do mesmo household do lançamento
alter table public.transactions
  add constraint transactions_account_fk foreign key (account_id, household_id)
  references public.accounts(id, household_id) on delete set null (account_id);

alter table public.transactions drop constraint transactions_tipo_check;
alter table public.transactions add constraint transactions_tipo_check
  check (tipo in ('despesa','receita','transferencia'));

alter table public.transactions drop constraint transactions_origem_check;
alter table public.transactions add constraint transactions_origem_check
  check (origem in ('manual','pdf','ofx'));

-- coalesce é necessário: sem ele, transfer_kind NULL avalia como "indefinido"
-- e o CHECK deixa passar uma transferência sem tipo
alter table public.transactions add constraint transactions_transfer_kind_check check (
  (tipo = 'transferencia' and coalesce(transfer_kind, '') in ('entre_contas','pagamento_fatura','household'))
  or (tipo <> 'transferencia' and transfer_kind is null and transfer_pair_id is null)
);

create unique index transactions_account_external on public.transactions(account_id, external_id) where external_id is not null;
create index transactions_household_date on public.transactions(household_id, data desc);
create index transactions_account on public.transactions(account_id) where account_id is not null;
create index transactions_batch   on public.transactions(import_batch_id) where import_batch_id is not null;
create index transactions_pair    on public.transactions(transfer_pair_id) where transfer_pair_id is not null;

-- 3. Lotes: conta e formato do arquivo
alter table public.import_batches
  add column account_id uuid,
  add column formato text not null default 'pdf' check (formato in ('pdf','ofx','manual'));
alter table public.import_batches
  add constraint import_batches_account_fk foreign key (account_id, household_id)
  references public.accounts(id, household_id) on delete set null (account_id);

notify pgrst, 'reload schema';
commit;
