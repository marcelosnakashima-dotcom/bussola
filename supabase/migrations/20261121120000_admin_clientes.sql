-- Área do administrador: lista de clientes e resumo de cada cliente.
-- NÃO APLICADA. Revisar e executar em produção pelo chat de trabalho, ANTES de publicar o front da área de admin.
-- Independe das migrações do Plano: recria is_arsen_admin() com a MESMA definição (create or replace).
--
-- Segurança:
-- - As funções são SECURITY DEFINER (precisam ler households de outros clientes e auth.users), mas
--   recusam com erro quem não é admin (user_roles.role = 'admin'). Cliente comum nunca recebe dados.
-- - Somente leitura de dados financeiros. A única escrita é o registro de auditoria (admin_acessos)
--   quando o admin abre o detalhe de um cliente.
-- - Não devolvem conteúdo de lançamentos (descrições), só agregados.
--
-- Rollback:
--   drop function public.admin_clientes();
--   drop function public.admin_cliente_detalhe(uuid);
--   drop table public.admin_acessos;
--   (is_arsen_admin() pode ficar: é usada também pelas migrações do Plano)

begin;

create or replace function public.is_arsen_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin');
$$;

-- Auditoria: quem (admin) abriu o resumo de qual household, e quando.
create table if not exists public.admin_acessos (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  acao         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists admin_acessos_household on public.admin_acessos(household_id, created_at desc);
alter table public.admin_acessos enable row level security;
drop policy if exists "admin le auditoria" on public.admin_acessos;
create policy "admin le auditoria" on public.admin_acessos
  for select to authenticated using (public.is_arsen_admin());
-- sem policy de insert/update/delete: só as funções abaixo gravam

-- Lista de clientes (um registro por household), com agregados.
create or replace function public.admin_clientes()
returns table (
  household_id      uuid,
  criado_em         timestamptz,
  membros           jsonb,
  tem_admin         boolean,
  ultimo_acesso     timestamptz,
  lancamentos       bigint,
  ultimo_lancamento date,
  ultima_importacao timestamptz,
  contas            int,
  ativos            numeric,
  dividas           numeric,
  receitas_mes      numeric,
  despesas_mes      numeric
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_ini date := date_trunc('month', current_date)::date;
begin
  if not public.is_arsen_admin() then
    raise exception 'apenas admin';
  end if;
  return query
    select
      h.id,
      h.created_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'user_id', u.id,
                 'nome', coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1)),
                 'email', u.email,
                 'ultimo_acesso', u.last_sign_in_at) order by u.created_at)
          from public.household_members hm join auth.users u on u.id = hm.user_id
         where hm.household_id = h.id), '[]'::jsonb),
      exists (select 1 from public.household_members hm join public.user_roles ur on ur.user_id = hm.user_id
               where hm.household_id = h.id and ur.role = 'admin'),
      (select max(u.last_sign_in_at) from public.household_members hm join auth.users u on u.id = hm.user_id
        where hm.household_id = h.id),
      (select count(*) from public.transactions t where t.household_id = h.id),
      (select max(t.data) from public.transactions t where t.household_id = h.id),
      (select max(b.created_at) from public.import_batches b where b.household_id = h.id),
      (select count(*)::int from public.accounts a where a.household_id = h.id and a.ativo),
      coalesce((select sum(a.valor) from public.assets a where a.household_id = h.id), 0),
      coalesce((select sum(d.valor) from public.debts d where d.household_id = h.id), 0),
      coalesce((select sum(t.valor) from public.transactions t
                 where t.household_id = h.id and t.status = 'confirmada' and t.tipo = 'receita' and t.data >= v_ini), 0),
      coalesce((select sum(t.valor) from public.transactions t
                 where t.household_id = h.id and t.status = 'confirmada' and t.tipo = 'despesa' and t.data >= v_ini), 0)
    from public.households h
    order by h.created_at desc;
end;
$$;

-- Resumo de um cliente: série mensal, contas, importações e categorias do mês. Registra o acesso.
create or replace function public.admin_cliente_detalhe(p_household uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_ini date := (date_trunc('month', current_date) - interval '11 months')::date;
  v_mes date := date_trunc('month', current_date)::date;
  v_out jsonb;
begin
  if not public.is_arsen_admin() then
    raise exception 'apenas admin';
  end if;
  if not exists (select 1 from public.households where id = p_household) then
    raise exception 'cliente não encontrado';
  end if;

  insert into public.admin_acessos (admin_id, household_id, acao) values (auth.uid(), p_household, 'ver_resumo');

  select jsonb_build_object(
    'membros', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', u.id,
               'nome', coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1)),
               'email', u.email,
               'ultimo_acesso', u.last_sign_in_at,
               'desde', u.created_at) order by u.created_at)
        from public.household_members hm join auth.users u on u.id = hm.user_id
       where hm.household_id = p_household), '[]'::jsonb),
    'serie', coalesce((
      select jsonb_agg(jsonb_build_object(
               'mes', to_char(m.mes, 'YYYY-MM'),
               'receitas', coalesce(s.receitas, 0), 'despesas', coalesce(s.despesas, 0),
               'necessidade', coalesce(s.necessidade, 0), 'desejo', coalesce(s.desejo, 0),
               'poupanca', coalesce(s.poupanca, 0)) order by m.mes)
        from generate_series(v_ini, v_mes, interval '1 month') as m(mes)
        left join (
          select date_trunc('month', t.data)::date as mes,
                 sum(t.valor) filter (where t.tipo = 'receita') as receitas,
                 sum(t.valor) filter (where t.tipo = 'despesa') as despesas,
                 sum(t.valor) filter (where t.tipo = 'despesa' and c.classificacao = 'necessidade') as necessidade,
                 sum(t.valor) filter (where t.tipo = 'despesa' and c.classificacao = 'desejo') as desejo,
                 sum(t.valor) filter (where t.tipo = 'despesa' and c.classificacao = 'poupanca') as poupanca
            from public.transactions t
            left join public.categories c on c.id = t.categoria_id
           where t.household_id = p_household and t.status = 'confirmada'
             and t.tipo in ('despesa', 'receita') and t.data >= v_ini
           group by 1
        ) s on s.mes = m.mes::date), '[]'::jsonb),
    'categorias_mes', coalesce((
      select jsonb_agg(x order by x.valor desc) from (
        select coalesce(c.nome, 'Sem categoria') as nome, c.classificacao, sum(t.valor) as valor
          from public.transactions t left join public.categories c on c.id = t.categoria_id
         where t.household_id = p_household and t.status = 'confirmada' and t.tipo = 'despesa' and t.data >= v_mes
         group by 1, 2) x), '[]'::jsonb),
    'contas', coalesce((
      select jsonb_agg(jsonb_build_object('apelido', a.apelido, 'instituicao', a.instituicao, 'tipo', a.tipo,
                                          'final', a.final, 'ativo', a.ativo) order by a.ativo desc, a.created_at)
        from public.accounts a where a.household_id = p_household), '[]'::jsonb),
    'importacoes', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select b.fonte, b.periodo_inicio, b.periodo_fim, b.quantidade, b.formato, b.created_at
          from public.import_batches b where b.household_id = p_household
         order by b.created_at desc limit 10) x), '[]'::jsonb),
    'ativos', coalesce((select sum(a.valor) from public.assets a where a.household_id = p_household), 0),
    'dividas', coalesce((select sum(d.valor) from public.debts d where d.household_id = p_household), 0)
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.admin_clientes() from public, anon;
revoke all on function public.admin_cliente_detalhe(uuid) from public, anon;
grant execute on function public.admin_clientes() to authenticated;
grant execute on function public.admin_cliente_detalhe(uuid) to authenticated;

commit;
