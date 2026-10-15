-- Plano: leitura do realizado e da cobertura de QUALQUER household, só para admin (seletor "Ver como" da tela Meu plano).
-- NÃO APLICADA. Revisar e executar em produção pelo chat de trabalho, depois das migrations 20261009120000 e 20261009150000.
-- Aditiva: duas funções novas. Nenhuma tabela ou linha é alterada.
-- Rollback:
--   drop function public.plano_realizado_admin(uuid, date, date);
--   drop function public.plano_cobertura_admin(uuid, date);
--
-- Mesma lógica de plano_realizado()/plano_cobertura(), mas com o household informado. SECURITY DEFINER com
-- checagem explícita de is_arsen_admin(): quem não é admin recebe erro, nunca dados de outro household.

begin;

create or replace function public.plano_realizado_admin(p_household uuid, p_de date, p_ate date)
returns table (mes date, categoria_id text, tipo text, total numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_arsen_admin() then
    raise exception 'apenas admin';
  end if;
  return query
    select date_trunc('month', t.data)::date, t.categoria_id, t.tipo, sum(t.valor)::numeric
      from public.transactions t
     where t.household_id = p_household
       and t.status = 'confirmada'
       and t.tipo in ('despesa','receita')
       and t.data >= p_de
       and t.data <= p_ate
     group by 1, 2, 3;
end;
$$;

create or replace function public.plano_cobertura_admin(p_household uuid, p_mes date)
returns table (contas_ativas int, contas_com_lote int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ini date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month' - interval '1 day')::date;
begin
  if not public.is_arsen_admin() then
    raise exception 'apenas admin';
  end if;
  return query
    with contas as (
      select a.id from public.accounts a where a.household_id = p_household and a.ativo
    )
    select (select count(*) from contas)::int,
           (select count(*) from contas c
             where exists (
               select 1 from public.import_batches b
                where b.account_id = c.id
                  and b.household_id = p_household
                  and b.periodo_inicio <= v_fim
                  and b.periodo_fim    >= v_ini))::int;
end;
$$;

revoke all on function public.plano_realizado_admin(uuid, date, date) from public, anon;
revoke all on function public.plano_cobertura_admin(uuid, date) from public, anon;
grant execute on function public.plano_realizado_admin(uuid, date, date) to authenticated;
grant execute on function public.plano_cobertura_admin(uuid, date) to authenticated;

commit;
