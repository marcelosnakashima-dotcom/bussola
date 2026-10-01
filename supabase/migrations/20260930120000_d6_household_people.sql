-- D6: nomes dos membros do household para o motor de detecção de transferências.
-- NÃO APLICADA. Revisar e executar em produção pelo chat de trabalho.
--
-- O front só enxerga o próprio user_metadata; o nome do cônjuge fica em auth.users.
-- Esta função devolve user_id e nome (sem e-mail) apenas dos membros do household
-- do usuário autenticado. Aditiva: não altera tabelas nem dados.
-- Rollback: drop function public.household_people();

begin;

create or replace function public.household_people()
returns table (user_id uuid, nome text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select hm.user_id,
         coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(u.email, '@', 1))
  from public.household_members hm
  join auth.users u on u.id = hm.user_id
  where hm.household_id = public.my_household_id()
$$;

revoke all on function public.household_people() from public, anon;
grant execute on function public.household_people() to authenticated;

commit;
