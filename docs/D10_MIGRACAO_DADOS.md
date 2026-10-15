# D10 — Migração dos dados reais

Objetivo: vincular os lançamentos importados **antes** do D6 às contas cadastradas e reclassificar as transferências que
hoje estão como despesa/receita. Nada é gravado sem a sua aprovação, e tudo pode ser revertido.

> Regras: um household por execução; chave de serviço só no seu terminal; arquivos gerados ficam em `private/` (fora do Git).
> Nunca cole descrições, nomes ou valores de clientes em chat ou issue. Compartilhe só contagens.

## Como funciona

0. **Contas.** Sem contas cadastradas não há para onde vincular. Se o cliente ainda não as criou no app, o comando `contas`
   cria a partir de uma lista (veja o passo a passo).
1. **Vincular lotes às contas.** Importações antigas gravaram os lançamentos e, logo depois, o lote. O script liga cada lote
   aos lançamentos gravados **entre o lote anterior e ele** (funciona mesmo em importações em massa) e confere se a contagem
   bate com `quantidade`. Lote que não bate é **pulado**. Você diz a conta por **regra de fonte** (`fonte~TRECHO`), que vale
   para todos os lotes cuja fonte contém o trecho, ou por id de lote.
2. **Propor transferências.** O mesmo motor do app (`src/lib/transferDetection.ts`) roda sobre os lançamentos e gera uma lista.
   Itens certos vêm `aprovado: true`; ambíguos, `aprovado: false`. Você edita o arquivo.
3. **Aplicar.** Simulação por padrão. Com `--confirmar`, grava o estado anterior em `private/` e só então altera.
4. **Reverter.** Restaura exatamente o estado anterior a partir desse arquivo.

Lançamentos **sem lote** (importações manuais antigas) aparecem em **GRUPOS SEM LOTE**, agrupados por origem e dia da gravação
(`pdf|2026-09-29`; os lançamentos manuais ficam juntos em `manual|*`). Você mapeia cada grupo a uma conta, olhando a
quantidade e o período das datas; esses vínculos guardam só a conta, sem lote. Grupo com `null` não é tocado.

## Pré-requisitos

- Migrações do D2, D6 e D9 aplicadas (coluna `transfer_direction` e funções).
- Contas do cliente já cadastradas em `/#/contas`, com **titular** correto (o motor depende disso).
- Node 22.18+ (testado em Node 24).
- **Backup** das tabelas antes (SQL Editor):

```sql
create schema if not exists backup_d10;
create table backup_d10.transactions_YYYYMMDD   as table public.transactions;
create table backup_d10.import_batches_YYYYMMDD as table public.import_batches;
alter table backup_d10.transactions_YYYYMMDD   enable row level security;
alter table backup_d10.import_batches_YYYYMMDD enable row level security;
```

(troque `YYYYMMDD` pela data; as tabelas de backup ficam sem acesso para `anon` e `authenticated`).

## Passo a passo (por household)

Pegue o `household_id` no SQL Editor (só para você; não cole os ids no chat):

```sql
select household_id, count(*) as membros from household_members group by 1 order by 2 desc;
```

No terminal, na pasta do projeto, **sem gravar a chave em arquivo**:

```bash
cd ~/Desktop/bussola
export SUPABASE_URL="https://biipfchogxyzenyebtby.supabase.co"
read -s "SUPABASE_SERVICE_ROLE_KEY?Chave de serviço: " && export SUPABASE_SERVICE_ROLE_KEY
```

0. **Criar as contas** (só se o household ainda não tem). Rode `lotes` uma vez (passo 1) para ver as **fontes** e os **membros**
   (`user_id`), e monte `private/contas-<id8>.json`:

```json
[
  { "instituicao": "Banco do Brasil", "apelido": "BB Corrente", "tipo": "corrente", "final": "27517", "owner_user_id": "<user_id do titular>" },
  { "instituicao": "Nubank", "apelido": "Nubank", "tipo": "corrente", "final": null, "owner_user_id": "<user_id do titular>" }
]
```

```bash
node scripts/d10/d10.mjs contas --household "<HOUSEHOLD_ID>" --arquivo private/contas-<id8>.json            # simulação
node scripts/d10/d10.mjs contas --household "<HOUSEHOLD_ID>" --arquivo private/contas-<id8>.json --confirmar # cria
```

   O `owner_user_id` pode ser só o começo do `user_id` (6 ou mais caracteres), desde que bata com um único membro do household.
   O comando valida tipo, final (3 a 6 dígitos), titular do household e duplicidade. Rode `lotes` de novo para pegar os ids das contas criadas.

1. **Lotes e contas:**

```bash
node scripts/d10/d10.mjs lotes --household <HOUSEHOLD_ID>
```

   Mostra as contas, os membros, as **fontes** (lotes agrupados por origem, sem mês/ano), os lotes sem conta com quantos
   lançamentos cada um encontrou (`exato: true` é o desejado) e os grupos sem lote. Cria `private/d10-<id8>-mapeamento.json`
   com uma regra `fonte~...` por fonte e uma chave por grupo. Troque cada `null` pelo id da conta (ou deixe `null` para não
   vincular). Pode encurtar o trecho (por exemplo `"fonte~27517"` pega todos os lotes cuja fonte contém 27517) e,
   para exceções, usar o id de um lote como chave: o id vence a regra.

2. **Proposta:**

```bash
node scripts/d10/d10.mjs propor --household <HOUSEHOLD_ID> --mapeamento private/d10-<id8>-mapeamento.json
```

   Gera `private/d10-<id8>-proposta.json`. **Revise item a item**: ajuste `"aprovado"`. Pares (`pairId`) precisam ter as duas
   pontas aprovadas ou nenhuma. Se quiser compartilhar comigo só números, informe quantos itens são certos e quantos ambíguos.

3. **Simulação (não grava nada):**

```bash
node scripts/d10/d10.mjs aplicar --household <HOUSEHOLD_ID> --mapeamento private/d10-<id8>-mapeamento.json --proposta private/d10-<id8>-proposta.json
```

4. **Aplicar de verdade** (só depois de revisar a simulação):

```bash
node scripts/d10/d10.mjs aplicar --household <HOUSEHOLD_ID> --mapeamento private/d10-<id8>-mapeamento.json --proposta private/d10-<id8>-proposta.json --confirmar
```

   Grava `private/d10-<id8>-antes-<timestamp>.json` **antes** de alterar. Se algum lançamento já mudou desde a proposta,
   ele é pulado e listado em `falhas`. É seguro repetir o comando.

5. **Verificar** (SQL Editor, só leitura; use o id do household):

```sql
-- pares devem ter exatamente 2 pontas, uma saída e uma entrada
select transfer_pair_id, count(*) as pontas,
       count(*) filter (where transfer_direction = 'saida') as saidas,
       count(*) filter (where transfer_direction = 'entrada') as entradas
from transactions
where household_id = '<HOUSEHOLD_ID>' and transfer_pair_id is not null
group by 1 having count(*) <> 2 or count(*) filter (where transfer_direction = 'saida') <> 1;
-- esperado: nenhuma linha

select tipo, count(*) from transactions where household_id = '<HOUSEHOLD_ID>' group by 1;
```

   Confira também, no app, o painel e o 50/30/20 do cliente.

6. **Se algo estiver errado, reverter:**

```bash
node scripts/d10/d10.mjs reverter --household <HOUSEHOLD_ID> --antes private/d10-<id8>-antes-<timestamp>.json
```

Repita o ciclo para cada household. Limpe a chave do terminal ao terminar: `unset SUPABASE_SERVICE_ROLE_KEY`.

## Limites conhecidos

- O vínculo por horário depende de os lançamentos antigos terem sido gravados até 10 min antes do lote (e 1 min depois).
  Lotes de outra forma aparecem com `exato: false` e não são vinculados.
- O motor lê o nome dos membros do cadastro (`full_name`). Sem nome ou com nome diferente do extrato, transferências para o
  cônjuge não são sugeridas (as ambíguas vêm reprovadas para você decidir).
- O adaptador real do Supabase só foi exercitado com um banco falso em testes. Rode primeiro a simulação e confira as contagens.
- Despesas e receitas com `status` diferente de `confirmada` são ignoradas.
