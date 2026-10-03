-- Nova categoria: Tarifas e juros bancários (juros de cheque especial, IOF, tarifas, anuidade).
-- NÃO APLICADA. Revisar e executar em produção pelo chat de trabalho.
-- Aditiva e reexecutável (on conflict do nothing). Rollback:
--   delete from public.categories where id = 'c-tarifas';   -- só se nenhum lançamento a usa
--
-- ORDEM IMPORTANTE: aplique este SQL ANTES de publicar as funções. Se a IA sugerir 'c-tarifas' sem a
-- categoria existir no banco, a gravação do lançamento falha por chave estrangeira.
-- Depois de aplicar, publicar as duas funções para a IA passar a sugeri-la:
--   supabase functions deploy parse-pdf --no-verify-jwt
--   supabase functions deploy categorize-text --no-verify-jwt

insert into public.categories (id, nome, classificacao, padrao)
values ('c-tarifas', 'Tarifas e juros bancários', 'necessidade', true)
on conflict (id) do nothing;
