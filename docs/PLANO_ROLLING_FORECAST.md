# Plano e rolling forecast no app

Tela **Meu plano** (`/#/plano`): o casal vê o conteúdo da apresentação (onde estamos, método, caixa, plano de corte, dívidas), a projeção dos próximos 12 meses, as pendências (com campo de resposta) e como o acompanhamento funciona.
O **realizado não é digitado**: sai das transações que o casal importa (extratos e faturas). Cada importação atualiza o forecast.

## Como funciona

1. **Plano (Arsen carrega).** Premissas e valores mensais por linha (24 meses) ficam em `plano_config`, `plano_linhas` e `plano_valores`.
   O casal só lê (RLS por `my_household_id()`); só admin grava.
2. **Realizado (automático).** `plano_realizado(de, ate)` soma as transações **confirmadas** do household, tipos `despesa` e `receita`,
   por mês e categoria. Transferências (entre contas, pagamento de fatura, entre pessoas) ficam de fora.
3. **Forecast.** `src/lib/planoForecast.ts` monta a janela de 12 meses a partir do **mês corrente** (primeiro mês não fechado),
   em quatro cenários e três bases de renda:
   - *Plano*: valores do plano. *Sem o corte*: desejos no patamar anterior (`sem_corte` de cada linha).
   - *Ritmo atual*: necessidades e desejos na média dos últimos 3 meses fechados (sem histórico, cai no plano). *Ritmo atual +10%*: o mesmo vezes 1,1.
   - Renda *típica* (plano), *holerite mais recente* (plano + `renda_ajuste_holerite`) ou *ritmo realizado* (média da receita dos meses fechados).
   - Dívidas e futuro seguem sempre o plano. Reserva: aporte = sobra positiva × `pct_reserva`; meta = `meta_reserva_meses` × (necessidades + dívidas + `meta_base_extra`).
4. **Fechar o mês (Arsen).** Na própria tela, o admin fecha o mês depois de conferir classificação e cobertura. O fechamento é em sequência
   (`plano_fechar_mes`): o mês corrente avança e a janela anda. Reabrir um mês reabre os posteriores.
5. **Cobertura.** `plano_cobertura(mes)` avisa quando alguma conta ou cartão ativo não tem lote importado que cruze o mês. É um alerta, não prova de extrato completo.

O plano usa a **visão de caixa** (dinheiro que entra e sai das contas). Consignados, plano de saúde e previdência descontados em folha **não são linhas**:
a renda já vem líquida deles. A parte de folha das necessidades entra só na base da meta da reserva (`meta_base_extra`).

## Mapa linhas × categorias do app

Cada linha de despesa rastreável aponta para categorias do app (`categoria_ids`); **uma categoria pertence a uma única linha** (o carregador recusa duplicidade).
A linha de receita rastreável recebe todas as receitas do mês (receitas não têm categoria no app).

Aproximações do primeiro plano, a refinar com os primeiros meses reais:
- Educação e atividades das filhas (inclui dança) ficam numa linha de necessidade, porque o app tem uma categoria só (`c-educacao`).
- A estimativa dos gastos à vista da Ana entra em Alimentação (parte necessidade) e Compras (parte desejo).
- Parcelas de dívidas pagas fora da folha (financiamentos, CDC, parcelamentos de fatura) ficam numa linha própria, categoria nova **`c-dividas`**
  ("Parcelas de dívidas"). Os lançamentos dessas parcelas precisam ser **reclassificados** para ela (hoje caem em Contas de consumo e Moradia);
  senão o consumo aparece acima do plano e a dívida abaixo. As funções `parse-pdf` e `categorize-text` ainda não sugerem `c-dividas`.
- Provisão de despesas anuais (IPVA, IPTU, seguros) não é linha: o pagamento aparece na categoria do mês em que ocorre.

## Publicar (ordem)

1. Revisar a migration `supabase/migrations/20261009120000_plano_rolling_forecast.sql` (não aplicada) e executá-la em produção pelo chat de trabalho.
2. Merge do PR (deploy automático do front). Sem plano carregado, a tela mostra "plano ainda não publicado".
3. Carregar o plano do casal (abaixo).
4. D10 do household, para o realizado ficar confiável (abaixo).

## Carregar o plano (terminal do Marcelo)

O arquivo do plano tem dados reais do cliente: fica em `private/` (fora do Git). Formato: `config` + `linhas[]` com `valores` (um número por mês).
O gerador usado para o casal lê a planilha de planejamento e grava `private/plano-<id8>.json`.

```bash
cd ~/Desktop/bussola
export SUPABASE_URL="https://biipfchogxyzenyebtby.supabase.co"
read -s "SUPABASE_SERVICE_ROLE_KEY?Chave de serviço: " && export SUPABASE_SERVICE_ROLE_KEY

node scripts/plano/plano.mjs carregar --household <HOUSEHOLD_ID> --arquivo private/plano-<id8>.json            # simulação
node scripts/plano/plano.mjs carregar --household <HOUSEHOLD_ID> --arquivo private/plano-<id8>.json --confirmar # grava
node scripts/plano/plano.mjs status   --household <HOUSEHOLD_ID>
```

A carga valida o arquivo (grupos, categorias, 24 valores por linha, categoria repetida), mostra um resumo **sem valores por linha** e é repetível
(atualiza linhas pelo `chave`; linhas do banco fora do arquivo não são removidas). Com meses fechados, não aceita mudar o início do plano.

## Dependência: D10

O realizado só é confiável depois do [D10](D10_MIGRACAO_DADOS.md): contas criadas, lotes e lançamentos vinculados, transferências classificadas.
Antes disso, movimentos entre contas ainda não classificados contam como despesa ou receita e distorcem o forecast.

## Testes

`npx vitest run src/lib/planoForecast.test.ts scripts/plano` (fixtures sintéticas).

## Conteúdo da tela e pendências (migration 20261009150000)

A migration `20261009150000_plano_conteudo_pendencias.sql` (aplicar depois da `20261009120000`) cria:

- `plano_conteudo`: uma seção por linha (`diagnostico`, `metodo`, `caixa`, `corte`, `dividas`) em jsonb. O código não tem nenhum valor do cliente.
  Seção ausente ou malformada simplesmente não aparece na tela (leitor em `src/lib/planoConteudo.ts`).
- `plano_pendencias`: itens a decidir, do casal ou da Arsen. O casal só grava a própria resposta, pela função `plano_responder_pendencia`
  (valida o household e que a pendência é do casal e não está resolvida). Status "resolvida" e o texto das pendências são da Arsen.
- `plano_config.realizado_visivel` (padrão `false`): enquanto for falso, a tela esconde "gastos reais contra o plano", os meses fechados e o
  aviso de extratos faltando. Ligue só quando as transferências entre contas estiverem classificadas e o realizado refletir o consumo real.

Carga (terminal do Marcelo, mesmo ambiente do `carregar`):

```bash
node scripts/plano/plano.mjs conteudo --household <HOUSEHOLD_ID> --arquivo private/plano-conteudo-<id8>.json            # simulação
node scripts/plano/plano.mjs conteudo --household <HOUSEHOLD_ID> --arquivo private/plano-conteudo-<id8>.json --confirmar # grava
node scripts/plano/plano.mjs realizado --household <HOUSEHOLD_ID> --visivel sim --confirmar                               # liga o realizado
```

O arquivo tem `secoes` (objeto) e `pendencias` (lista com `ordem`, `titulo`, `detalhe`, `responsavel`). Repetir a carga atualiza as seções e os
textos das pendências (casadas pelo título) sem apagar resposta, status ou data do casal. Pendências do banco fora do arquivo não são removidas.
O carregador e o aplicativo validam as seções com as mesmas regras (há um teste cruzado em `src/lib/planoConteudo.test.ts`).
