-- Plano e rolling forecast: plano mensal por household, realizado calculado das transações.
-- NÃO APLICADA. Revisar e executar em produção pelo chat de trabalho.
-- Aditiva: só cria tabelas e funções novas. Nenhuma linha existente é alterada.
-- Rollback:
--   drop function public.plano_fechar_mes(uuid, date, boolean);
--   drop function public.plano_cobertura(date);
--   drop function public.plano_realizado(date, date);
--   drop table public.plano_meses_fechados, public.plano_valores, public.plano_linhas, public.plano_config;
--   drop function public.is_arsen_admin();
--   delete from public.categories where id = 'c-dividas';   -- só se nenhum lançamento a usa
--
-- Modelo:
--   plano_config          premissas do household (início do plano, saldo da reserva, % da sobra para a reserva, meta em meses)
--   plano_linhas          linhas do plano (receita, necessidade, dívida, desejo, futuro) e as categorias do app que alimentam cada uma
--   plano_valores         valor planejado de cada linha em cada mês (até 24 meses)
--   plano_meses_fechados  meses conferidos pela Arsen; o mês corrente do forecast é o primeiro mês não fechado
--
-- O realizado NÃO é gravado: plano_realizado() soma as transações confirmadas (despesa/receita, nunca
-- transferência) do household de quem chama. Cada importação de extrato ou fatura atualiza o forecast.
-- Linhas com rastreavel = false (ex.: consignado descontado em folha) não aparecem no extrato; o app usa o planejado.
--
-- Acesso: o casal só lê (RLS por my_household_id()). Só admin (user_roles.role = 'admin') grava. Os valores reais
-- entram pelo script scripts/plano/carregar-plano.mjs, rodado no terminal do Marcelo; este arquivo não tem dados.

begin;

-- Parcelas de dívidas (financiamentos, CDC, parcelamentos de fatura) saem das categorias de consumo para o plano
-- conseguir comparar o consumo e o serviço da dívida separadamente. Reexecutável.
insert into public.categories (id, nome, classificacao, padrao)
values ('c-dividas', 'Parcelas de dívidas', 'necessidade', true)
on conflict (id) do nothing;

-- Admin da Arsen, mesma regra que a Edge Function create-client-access usa (user_roles).
create or replace function public.is_arsen_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin');
$$;

create table public.plano_config (
  household_id          uuid primary key references public.households(id) on delete cascade,
  inicio                date not null check (inicio = date_trunc('month', inicio)::date),
  meses                 int  not null default 24 check (meses between 12 and 36),
  reserva_saldo         numeric(14,2) not null default 0,
  reserva_saldo_em      date,
  pct_reserva           numeric(5,4) not null default 1 check (pct_reserva between 0 and 1),
  meta_reserva_meses    numeric(4,1) not null default 6 check (meta_reserva_meses > 0),
  renda_ajuste_holerite numeric(14,2) not null default 0,
  -- necessidades descontadas em folha (consignado, plano de saúde): fora do caixa, mas entram na base da meta da reserva
  meta_base_extra       numeric(14,2) not null default 0 check (meta_base_extra >= 0),
  atualizado_em         timestamptz not null default now()
);

create table public.plano_linhas (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  chave         text not null,
  rotulo        text not null,
  grupo         text not null check (grupo in ('receita','necessidade','divida','desejo','futuro')),
  categoria_ids text[] not null default '{}',
  rastreavel    boolean not null default true,
  sem_corte     numeric(14,2) check (sem_corte is null or sem_corte >= 0),
  ordem         int not null default 0,
  constraint plano_linhas_chave_key unique (household_id, chave),
  constraint plano_linhas_id_household_key unique (id, household_id)
);
create index plano_linhas_household on public.plano_linhas(household_id, ordem);

create table public.plano_valores (
  linha_id     uuid not null,
  household_id uuid not null,
  mes          date not null check (mes = date_trunc('month', mes)::date),
  valor        numeric(14,2) not null,
  primary key (linha_id, mes),
  foreign key (linha_id, household_id) references public.plano_linhas(id, household_id) on delete cascade
);
create index plano_valores_household_mes on public.plano_valores(household_id, mes);

create table public.plano_meses_fechados (
  household_id uuid not null references public.households(id) on delete cascade,
  mes          date not null check (mes = date_trunc('month', mes)::date),
  fechado_em   timestamptz not null default now(),
  fechado_por  uuid references auth.users(id) on delete set null,
  primary key (household_id, mes)
);

alter table public.plano_config         enable row level security;
alter table public.plano_linhas         enable row level security;
alter table public.plano_valores        enable row level security;
alter table public.plano_meses_fechados enable row level security;

create policy "ler plano do household" on public.plano_config
  for select to authenticated using (household_id = my_household_id());
create policy "admin gerencia plano_config" on public.plano_config
  for all to authenticated using (is_arsen_admin()) with check (is_arsen_admin());

create policy "ler linhas do household" on public.plano_linhas
  for select to authenticated using (household_id = my_household_id());
create policy "admin gerencia plano_linhas" on public.plano_linhas
  for all to authenticated using (is_arsen_admin()) with check (is_arsen_admin());

create policy "ler valores do household" on public.plano_valores
  for select to authenticated using (household_id = my_household_id());
create policy "admin gerencia plano_valores" on public.plano_valores
  for all to authenticated using (is_arsen_admin()) with check (is_arsen_admin());

create policy "ler meses fechados do household" on public.plano_meses_fechados
  for select to authenticated using (household_id = my_household_id());
create policy "admin gerencia meses fechados" on public.plano_meses_fechados
  for all to authenticated using (is_arsen_admin()) with check (is_arsen_admin());

-- Realizado por mês e categoria, só do household de quem chama (SECURITY INVOKER: a RLS de transactions também vale).
-- Transferências (entre contas, pagamento de fatura, entre pessoas do household) ficam de fora de propósito.
create or replace function public.plano_realizado(p_de date, p_ate date)
returns table (mes date, categoria_id text, tipo text, total numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select date_trunc('month', t.data)::date as mes,
         t.categoria_id,
         t.tipo,
         sum(t.valor)::numeric as total
    from public.transactions t
   where t.household_id = public.my_household_id()
     and t.status = 'confirmada'
     and t.tipo in ('despesa','receita')
     and t.data >= p_de
     and t.data <= p_ate
   group by 1, 2, 3;
$$;

-- Cobertura do mês: quantas contas ativas têm lote importado cuja janela cruza o mês.
-- É um indicador para o app avisar "faltam extratos"; não prova que o extrato está completo.
create or replace function public.plano_cobertura(p_mes date)
returns table (contas_ativas int, contas_com_lote int)
language sql
stable
security invoker
set search_path = public
as $$
  with m as (
    select date_trunc('month', p_mes)::date as ini,
           (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as fim
  ), contas as (
    select a.id from public.accounts a
     where a.household_id = public.my_household_id() and a.ativo
  )
  select (select count(*) from contas)::int,
         (select count(*) from contas c
           where exists (
             select 1 from public.import_batches b, m
              where b.account_id = c.id
                and b.household_id = public.my_household_id()
                and b.periodo_inicio <= m.fim
                and b.periodo_fim    >= m.ini))::int;
$$;

-- Fechar ou reabrir um mês de um household. Só admin. Fechar exige que o mês anterior (se já estiver
-- dentro do plano) esteja fechado, para o mês corrente nunca pular.
create or replace function public.plano_fechar_mes(p_household uuid, p_mes date, p_fechar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_inicio date;
begin
  if not public.is_arsen_admin() then
    raise exception 'apenas admin';
  end if;
  select inicio into v_inicio from public.plano_config where household_id = p_household;
  if v_inicio is null then
    raise exception 'household sem plano';
  end if;
  if v_mes < v_inicio then
    raise exception 'mês anterior ao início do plano';
  end if;
  if p_fechar then
    if v_mes > v_inicio and not exists (
      select 1 from public.plano_meses_fechados
       where household_id = p_household and mes = (v_mes - interval '1 month')::date
    ) then
      raise exception 'feche o mês anterior primeiro';
    end if;
    insert into public.plano_meses_fechados (household_id, mes, fechado_por)
    values (p_household, v_mes, auth.uid())
    on conflict (household_id, mes) do nothing;
  else
    -- reabrir um mês também reabre os posteriores, mantendo a sequência
    delete from public.plano_meses_fechados where household_id = p_household and mes >= v_mes;
  end if;
end;
$$;

revoke all on function public.plano_fechar_mes(uuid, date, boolean) from public, anon;
grant execute on function public.plano_fechar_mes(uuid, date, boolean) to authenticated;

commit;
