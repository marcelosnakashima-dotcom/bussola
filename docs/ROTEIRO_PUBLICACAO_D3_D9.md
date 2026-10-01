# Roteiro de publicação — D3 a D9

O front do D3–D9 já está no ar (deploy `1c9aaaa`). Este roteiro conclui o que depende de banco e de Edge Functions.
Execução em produção é feita no chat de trabalho/painel do Supabase, na ordem abaixo. Projeto: `biipfchogxyzenyebtby`.

> Sem credenciais neste arquivo. Chaves (ANTHROPIC_API_KEY etc.) já são secrets do projeto.

## 0. Antes de começar

- Confirme que `main` está no commit esperado e o deploy do Pages ficou verde.
- Backup: as duas migrações são aditivas (uma coluna nula e funções), mas faça um backup lógico das tabelas
  `transactions` e `import_batches` antes, como foi feito no D2 (`backup_YYYYMMDD`, fora da API, com RLS).

## 1. Migrações (SQL Editor do Supabase, uma por vez, nesta ordem)

1. `supabase/migrations/20260930120000_d6_household_people.sql`
   - Cria `household_people()`: nomes dos membros do household para o motor de transferências.
2. `supabase/migrations/20260930130000_d9_pareamento_desfazer.sql`
   - Coluna `transactions.transfer_direction` (nula) e as funções `link_transfer_pair`,
     `unlink_transfer_pairs`, `undo_import_batch`.

Cada arquivo roda dentro de `begin; … commit;`. Se der erro, nada é aplicado; leia a mensagem antes de repetir.

### Verificação (somente leitura)

```sql
-- as 4 funções existem e só 'authenticated' executa
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('household_people','link_transfer_pair','unlink_transfer_pairs','undo_import_batch');

select proname, has_function_privilege('anon', oid, 'execute') as anon_executa
from pg_proc where proname in ('household_people','link_transfer_pair','unlink_transfer_pairs','undo_import_batch');
-- anon_executa deve ser false nas quatro

-- coluna nova e constraint
select column_name, is_nullable from information_schema.columns
where table_name = 'transactions' and column_name = 'transfer_direction';
select conname from pg_constraint where conname = 'transactions_transfer_direction_check';
```

### Rollback (se necessário)

```sql
drop function public.household_people();
drop function public.link_transfer_pair(uuid, text, uuid);
drop function public.unlink_transfer_pairs(uuid[], uuid);
drop function public.undo_import_batch(uuid, boolean);
alter table public.transactions drop constraint transactions_transfer_direction_check;
alter table public.transactions drop column transfer_direction;
```

Só faça o rollback das colunas se nenhuma transferência com direção já tiver sido gravada.

## 2. Edge Functions

Com o CLI do Supabase logado na conta dona do projeto:

```bash
supabase link --project-ref biipfchogxyzenyebtby
supabase functions deploy parse-pdf --no-verify-jwt
supabase functions deploy categorize-text --no-verify-jwt
```

- `parse-pdf`: a versão do repositório inclui o ajuste da regra 2 do prompt (não ignora mais pagamento de fatura) e
  não devolve mais o campo `raw`. O contrato com o front não mudou.
- `categorize-text` (nova): valida a sessão do usuário por conta própria, por isso o `--no-verify-jwt`.
  Usa os secrets existentes `ANTHROPIC_API_KEY`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
- A lista de categorias está duplicada nas duas funções. Se mudar uma, mude a outra.

### Verificação

- Painel Supabase → Edge Functions → logs de cada função após o primeiro uso.
- O navegador deve receber cabeçalho CORS mesmo em erro (sem "Failed to fetch").

## 3. Teste de fumaça (com uma conta de teste, nunca com dados de clientes)

1. `/#/contas`: criar duas contas de teste (uma corrente, uma cartão); se houver dois logins no household,
   conferir o seletor "Titular da conta" e que o cônjuge aparece pelo nome.
2. `/#/importar`: lançamento manual com conta; ele aparece no painel e o filtro por conta funciona.
3. Importar um PDF ou OFX sintético da conta corrente: conferir selo "Transferência", motivo, ambíguos pedindo decisão.
4. Reimportar o mesmo OFX: tudo deve vir como "Já importado" e nada novo é criado.
5. Importar o extrato de outra conta com a contrapartida de uma transferência: deve aparecer
   "Par com lançamento já gravado".
6. Histórico "Já importado" → Desfazer: lançamentos do lote somem e o parceiro volta a despesa/receita.
7. Painel e 50/30/20: transferências não alteram receitas, despesas nem o saldo.

Se algo falhar, anote a tela, o texto do erro e a hora; o app grava erros técnicos na tabela `system_errors`.

## 4. Pendências conhecidas

- OFX reais ainda não foram testados: confirmar sinal do cartão (botão "Inverter sinais") e a estrutura de cada banco.
  Arquivos reais ficam em `private/`, nunca commitados.
- Importações anteriores ao D2 não têm lote vinculado: o Desfazer as recusa com aviso.
- CI do deploy usa Node 20 e não roda `npm test` (vitest exige Node 22 ou mais novo). Rodar `npm test` localmente antes de mesclar.
- Barra de navegação do celular está apertada com 9 itens (10 para admin).
