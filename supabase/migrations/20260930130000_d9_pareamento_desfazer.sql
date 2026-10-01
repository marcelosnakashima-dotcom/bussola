-- D9: pareamento com lançamentos já gravados e "desfazer importação".
-- NÃO APLICADA. Revisar e executar em produção pelo chat de trabalho.
-- Aditiva: uma coluna nova (nula) e três funções. Nenhuma linha existente é alterada.
-- Rollback:
--   drop function public.link_transfer_pair(uuid, text, uuid);
--   drop function public.unlink_transfer_pairs(uuid[], uuid);
--   drop function public.undo_import_batch(uuid, boolean);
--   alter table public.transactions drop constraint transactions_transfer_direction_check;
--   alter table public.transactions drop column transfer_direction;
--
-- Por que esta coluna: 'transferencia' não guarda se o dinheiro saiu ou entrou
-- (valor é sempre positivo). Sem a direção não dá para devolver um lançamento
-- à condição de despesa/receita ao desfazer uma importação.
--
-- Por que funções em vez de só uma policy de DELETE em import_batches: desfazer
-- precisa, na mesma transação, restaurar os parceiros pareados, apagar os
-- lançamentos do lote e apagar o lote. Fazer em passos pelo navegador deixaria
-- estados pela metade se algum passo falhasse. As funções são SECURITY DEFINER
-- mas só operam sobre linhas do household de quem chama (my_household_id()).

begin;

alter table public.transactions
  add column transfer_direction text
  check (transfer_direction is null or transfer_direction in ('saida','entrada'));

alter table public.transactions
  add constraint transactions_transfer_direction_check
  check (transfer_direction is null or tipo = 'transferencia');

-- Converte um lançamento já gravado (despesa/receita) em ponta de transferência.
-- A direção sai do tipo atual; a categoria é mantida para a reversão.
create or replace function public.link_transfer_pair(p_tx_id uuid, p_kind text, p_pair_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare t public.transactions;
begin
  if p_kind not in ('entre_contas','pagamento_fatura','household') then
    raise exception 'tipo de transferência inválido';
  end if;
  select * into t from public.transactions
   where id = p_tx_id and household_id = public.my_household_id()
   for update;
  if not found then raise exception 'lançamento não encontrado'; end if;
  if t.tipo not in ('despesa','receita') then
    raise exception 'lançamento já é uma transferência';
  end if;
  update public.transactions
     set tipo = 'transferencia',
         transfer_kind = p_kind,
         transfer_pair_id = p_pair_id,
         transfer_direction = case when t.tipo = 'despesa' then 'saida' else 'entrada' end
   where id = p_tx_id;
end $$;

-- Devolve a despesa/receita as pontas pareadas (exceto as do lote indicado).
-- Linhas sem direção gravada não podem ser revertidas e são ignoradas.
create or replace function public.unlink_transfer_pairs(p_pair_ids uuid[], p_except_batch uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.transactions
     set tipo = case transfer_direction when 'saida' then 'despesa' else 'receita' end,
         transfer_kind = null,
         transfer_pair_id = null,
         transfer_direction = null
   where household_id = public.my_household_id()
     and tipo = 'transferencia'
     and transfer_direction is not null
     and transfer_pair_id = any(p_pair_ids)
     and import_batch_id is distinct from p_except_batch;
  get diagnostics n = row_count;
  return n;
end $$;

-- Desfaz uma importação inteira: restaura parceiros, apaga lançamentos e o lote.
-- Lote sem lançamentos vinculados (importado antes do controle de lotes) é
-- recusado, a menos que p_force_empty = true (limpeza de lote órfão).
create or replace function public.undo_import_batch(p_batch_id uuid, p_force_empty boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pair_ids uuid[];
  restored integer := 0;
  deleted integer;
begin
  perform 1 from public.import_batches
   where id = p_batch_id and household_id = public.my_household_id();
  if not found then raise exception 'importação não encontrada'; end if;

  select coalesce(array_agg(distinct transfer_pair_id), '{}') into pair_ids
    from public.transactions
   where import_batch_id = p_batch_id and transfer_pair_id is not null;

  if cardinality(pair_ids) > 0 then
    restored := public.unlink_transfer_pairs(pair_ids, p_batch_id);
  end if;

  delete from public.transactions
   where import_batch_id = p_batch_id and household_id = public.my_household_id();
  get diagnostics deleted = row_count;

  if deleted = 0 and not p_force_empty then
    raise exception 'esta importação não tem lançamentos vinculados (anterior ao controle de lotes)';
  end if;

  delete from public.import_batches
   where id = p_batch_id and household_id = public.my_household_id();

  return jsonb_build_object('deleted', deleted, 'restored', restored);
end $$;

revoke all on function public.link_transfer_pair(uuid, text, uuid) from public, anon;
revoke all on function public.unlink_transfer_pairs(uuid[], uuid) from public, anon;
revoke all on function public.undo_import_batch(uuid, boolean) from public, anon;
grant execute on function public.link_transfer_pair(uuid, text, uuid) to authenticated;
grant execute on function public.unlink_transfer_pairs(uuid[], uuid) to authenticated;
grant execute on function public.undo_import_batch(uuid, boolean) to authenticated;

commit;
