# Arsen Capital — contexto do projeto

Contexto para o Claude Code. Idioma de trabalho: português.

> **Este repositório é público.** Nunca commitar dados de clientes: nomes, CPFs, números de conta, IDs de household, valores reais, extratos ou faturas (PDF/OFX). Fixtures de teste devem ser sintéticas. Arquivos reais de clientes, se precisarem existir localmente, ficam em `private/` (no `.gitignore`).

## O produto

PWA de finanças pessoais usada pelos clientes da consultoria do Marcelo: visão consolidada, importação de extratos e faturas, ativos, dívidas, metas 50/30/20, despesas recorrentes, diagnóstico e painel admin. Casais compartilham um *household* (grupo familiar), cada um com seu login.

- Produção: `arsencapital.com` (GitHub Pages, deploy por push na `main` via `.github/workflows/deploy.yml`)
- Repositório: `marcelosnakashima-dotcom/bussola`
- Backend: Supabase, projeto `biipfchogxyzenyebtby` (auth, Postgres com RLS, Edge Functions em Deno)
- Front: React 18 + TypeScript + Vite + TanStack Router (hash history, rotas como `/#/importar`) + Tailwind v4 + shadcn/ui + Recharts

## Regras de trabalho

- **O Marcelo revisa e aprova; o Claude executa.** Credenciais (API keys, senhas, tokens) ficam sempre com o Marcelo.
- **Deploy só com autorização explícita.** Merge na `main` = deploy. As mudanças se acumulam e passam por revisão visual antes de ir ao ar.
- **SQL em produção e deploy de Edge Function não são feitos daqui.** Mudanças de banco viram arquivo em `supabase/migrations/` para revisão; a execução em produção é feita no chat de trabalho, depois de aprovada.
- Histórico: o app nasceu no Lovable e `main` já ficou atrás da versão publicada; a branch `gh-pages` tem o build canônico. Em 29/09 `main` foi sincronizada com produção (PR #1). Se suspeitar de nova divergência, reportar antes de construir em cima.

## Estado do banco após o D2 (aplicado em produção em 29/09/2026)

O SQL está em `supabase/migrations/20260929120000_d2_accounts_transfers.sql` (já aplicado; não reexecutar).

- **`accounts`** (nova): `id`, `household_id`, `owner_user_id`, `instituicao`, `apelido`, `tipo` (`corrente` | `poupanca` | `investimento` | `cartao` | `outro`), `final` (3 a 6 dígitos, opcional), `ativo`, `created_at`. RLS: `household_id = my_household_id()`.
- **`transactions`**, colunas novas:
  - `account_id`: FK composta `(account_id, household_id)`, então a conta tem de ser do mesmo household.
  - `import_batch_id`: FK para `import_batches`.
  - `transfer_kind`: `entre_contas` | `pagamento_fatura` | `household`.
  - `transfer_pair_id`: uuid compartilhado pelas duas pontas de uma transferência.
  - `external_id`: FITID do OFX, único por conta.
- **`transactions`**, restrições:
  - `tipo` aceita `despesa` | `receita` | `transferencia`.
  - `origem` aceita `manual` | `pdf` | `ofx`.
  - Toda `transferencia` exige `transfer_kind`; `despesa` e `receita` não podem ter `transfer_kind` nem `transfer_pair_id`.
- **`import_batches`**, colunas novas: `account_id` (FK composta) e `formato` (`pdf` | `ofx` | `manual`).
- Hoje nenhuma linha usa as colunas novas. Backup pré-migração em `backup_20260929.*`, fora da API.
- Categorias: ids em texto (`c-moradia`, `c-alimentacao`, `c-transporte`, `c-saude`, `c-educacao`, `c-contas`, `c-restaurante`, `c-lazer`, `c-compras`, `c-viagem`, `c-assinaturas`, `c-reserva`, `c-investimentos`, `c-previdencia`), com `classificacao` `necessidade` | `desejo` | `poupanca`.
- `import_batches` só tem policies de SELECT e INSERT. O "desfazer importação" (D9) vai exigir policy de DELETE, via migração.

## Edge Function `parse-pdf`

`supabase/functions/parse-pdf/index.ts` é a versão publicada em 29/09/2026.

- **Causa do antigo "Failed to fetch":** extratos com mais de ~40 lançamentos estouravam `max_tokens: 4096`, o JSON vinha cortado, e o erro 500 saía sem cabeçalho CORS.
- **Correção:** resposta compacta do modelo (~30 tokens por lançamento), `MAX_TOKENS = 12000`, CORS em todas as respostas, 422 explícito quando a resposta é cortada, log de diagnóstico por chamada.
- **Contrato com o front:** `{ transacoes[], periodo, total_despesas, total_receitas, fonte, tokens_usados }`.
- **Regra 2 do prompt** ("ignore pagamento de fatura") continua. No D6 ela deve ceder lugar ao motor de detecção: a função extrai tudo e o motor classifica.
- Pendência para o D6: quando o JSON é inválido a função devolve `raw` (até 500 caracteres do texto extraído), o que pode vazar descrições de lançamentos.
- Erros do front vão para a tabela `system_errors` via `logSystemError` em `ImportPage.tsx`.

## Pontos do código que a sprint afeta

Referências de `main` em 29/09; conferir contra o código atual.

- `src/lib/supabase.ts:37`: `interface Transaction`, com `tipo: 'despesa' | 'receita'` na linha 44. Incluir `'transferencia'` e as colunas novas.
- `src/pages/ImportPage.tsx:14`: tipo local `tipo: 'despesa' | 'receita'`. Fluxo: `fetch` para `/functions/v1/parse-pdf` com o Bearer da sessão, tela de revisão, `allCategorized` (linha 218), depois `bulkInsert` + `addBatch`.
- `src/hooks/useData.ts:151-152` e `:181`: os totais filtram estritamente `despesa` e `receita` confirmadas, então transferências já ficam fora do 50/30/20 sem mudança.
- `src/components/charts/AnimatedCharts.tsx:86`: **bug a corrigir no D4.** O `SaldoChart` faz `tipo === 'receita' ? +valor : -valor` e subtrairia transferências. Transferência não deve mexer no saldo consolidado.
- `src/pages/DashboardPage.tsx:210-216`: a lista mostra `categoria_id` cru e só dois estados de cor; precisa de um terceiro estado para transferência.

## Sprint (15 dias corridos ≈ 11 úteis)

D1 (`parse-pdf`) e D2 (banco) já foram feitos. Pontos de parada obrigatórios para o Marcelo: **revisão visual 1** (após o D4), **revisão visual 2** (após o D8), **aprovação da lista de reclassificação** (D10) e **autorização de deploy** (D11).

| Dia | Entrega |
|---|---|
| D3 | Tela de Contas: CRUD de contas e cartões por household (instituição, apelido, tipo, final, ativo). Desativar em vez de apagar. |
| D4 | Correção do `SaldoChart`; filtro por conta e selo "Transferência" nas listas; lançamento manual com conta. → **Revisão visual 1** |
| D5 | Motor de detecção de transferências como módulo TS puro, com testes (regras abaixo). |
| D6 | Motor na tela de revisão: etapa "de qual conta é este arquivo?"; transferências exibidas com o motivo; o usuário pode reverter; gravar `account_id`, `import_batch_id` e `transfer_*`. Ajuste da regra 2 no prompt do `parse-pdf`. |
| D7 | Leitor de OFX no navegador: OFX 1.x (SGML) e 2.x (XML), acentos em latin-1 / windows-1252, `STMTTRN` (TRNTYPE, DTPOSTED, TRNAMT, FITID, NAME, MEMO), extrato de conta e de cartão (`CCSTMTRS`). Testar com os OFX reais que o Marcelo fornecer (em `private/`, nunca commitados). |
| D8 | Categorização só por texto (Edge Function leve, payload de descrições); deduplicação por FITID; fluxo OFX completo. → **Revisão visual 2** |
| D9 | Pareamento com lançamentos já gravados em outras contas do household; "desfazer importação" por `import_batch_id` (com migração de policy de DELETE). |
| D10 | Migração dos dados reais: vincular lançamentos às contas e reclassificar transferências. O script é gerado aqui, e a lista de alterações passa pelo Marcelo antes da execução. |
| D11 | Folga e correções; deploy após autorização; texto de orientação ao cliente. |

### Regras de detecção (D5)

1. **Titular ou household:** contraparte com nome de um membro do household vira transferência. `household` se for outro membro, `entre_contas` se for o próprio titular. Normalizar nomes: sem acento, caixa alta, tolerância a truncamento e sufixos como `F` (extratos cortam o sobrenome).
2. **Emissor de cartão:** Pix ou boleto para instituição em que o household tem conta do tipo `cartao` vira `pagamento_fatura`. Exemplos de emissor: Nu Pagamentos, XP, BB Cartões, Santander, Mercado Pago.
3. **Par entre contas:** saída numa conta e entrada de mesmo valor em outra conta do household, com até 2 dias de diferença, formam um par. Mesmo `transfer_pair_id` nas duas pontas.
4. **Ambíguos:** aparecem na revisão com a sugestão marcada. Nunca gravar em silêncio.

### Critérios de aceite

- Extrato de conta corrente com salário, Pix para si mesmo, Pix para o cônjuge e pagamento de cartão: só as despesas reais entram como despesa, e o resto vira transferência com o `transfer_kind` correto. Montar fixture sintética com esse padrão.
- Importar extratos de várias contas do mesmo household não infla receita nem despesa, e cada par de transferência soma zero.
- Reimportar o mesmo OFX não cria nenhum lançamento novo.
- Nenhuma alteração no dashboard ou no 50/30/20 para lançamentos que não são transferência.

## Aprendizados

- Dado sensível do cliente não entra no repositório.
- Garantir CORS em todas as respostas das Edge Functions, inclusive nos erros; sem isso o navegador mascara a causa real.
- Pagamento de fatura na conta corrente e o detalhe da fatura do cartão representam o mesmo dinheiro. Contar os dois duplica o gasto.
- Pix entre contas do mesmo titular aparece duas vezes, como saída numa instituição e entrada na outra.
- Parcelas antigas em faturas: a importação manual de 29/09 datou essas parcelas no fechamento da fatura, para caírem no mês do orçamento.
- Conteúdo financeiro educativo deve ser apresentado como não-recomendação.
