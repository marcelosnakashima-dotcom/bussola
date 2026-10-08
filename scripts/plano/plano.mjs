#!/usr/bin/env node
// Plano e rolling forecast: carga do plano de um household (rodar no terminal do Marcelo).
// Uso e passo a passo: docs/PLANO_ROLLING_FORECAST.md
//
//   node scripts/plano/plano.mjs carregar --household <uuid> --arquivo private/plano-<id8>.json [--confirmar]
//   node scripts/plano/plano.mjs status   --household <uuid>
//
// Variáveis de ambiente (nunca impressas, nunca gravadas): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// A chave de serviço ignora a RLS, então toda consulta e gravação é filtrada por household_id aqui.
// Sem --confirmar nada é gravado. O arquivo do plano tem dados reais do cliente e fica em private/.

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { validarPlano, montarCarga, resumoCarga } from './carregar.mjs'

const [, , command, ...rest] = process.argv
const args = {}
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const key = rest[i].slice(2)
    args[key] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true
  }
}
const fail = msg => { console.error(`Erro: ${msg}`); process.exit(1) }

if (!['carregar', 'status'].includes(command ?? '')) fail('comando deve ser carregar ou status.')
const household = args.household
if (!household || household === true || !/^[0-9a-f-]{36}$/i.test(household)) fail('informe --household <uuid>.')
const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) fail('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (sem gravar em arquivo).')

const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const must = ({ data, error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); return data }

async function carregar() {
  if (!args.arquivo || args.arquivo === true) fail('informe --arquivo private/plano-<id8>.json.')
  let plano
  try { plano = JSON.parse(fs.readFileSync(args.arquivo, 'utf8')) } catch (e) { fail(`não consegui ler ${args.arquivo}: ${e.message}`) }
  const erros = validarPlano(plano)
  if (erros.length) fail(`arquivo inválido:\n- ${erros.join('\n- ')}`)

  const membros = must(await sb.from('household_members').select('user_id').eq('household_id', household), 'ler membros')
  if (membros.length === 0) fail('household sem membros (id errado?).')

  const cfgAtual = must(await sb.from('plano_config').select('inicio,meses').eq('household_id', household).maybeSingle(), 'ler config')
  const fechados = must(await sb.from('plano_meses_fechados').select('mes').eq('household_id', household), 'ler meses fechados')
  if (cfgAtual && fechados.length > 0 && cfgAtual.inicio !== plano.config.inicio) {
    fail('já há meses fechados e o início do plano mudou. Reabra os meses no app antes de mudar o início.')
  }

  const existentes = must(await sb.from('plano_linhas').select('id,chave').eq('household_id', household), 'ler linhas')
  const idPorChave = new Map(existentes.map(l => [l.chave, l.id]))
  const carga = montarCarga(plano, household, idPorChave)
  const novas = carga.linhas.filter(l => !idPorChave.has(l.chave)).length
  const chavesArquivo = new Set(carga.linhas.map(l => l.chave))
  const fora = existentes.filter(l => !chavesArquivo.has(l.chave)).map(l => l.chave)

  console.log('\nRESUMO DA CARGA (sem valores por linha)')
  console.log(JSON.stringify(resumoCarga(plano), null, 2))
  console.log(`Linhas novas: ${novas}; linhas atualizadas: ${carga.linhas.length - novas}; valores: ${carga.valores.length}`)
  if (fora.length) console.log(`Atenção: ${fora.length} linha(s) do banco não estão no arquivo e NÃO serão removidas: ${fora.join(', ')}`)
  if (fechados.length) console.log(`Meses fechados mantidos: ${fechados.length}`)

  if (!args.confirmar) { console.log('\nSimulação: nada foi gravado. Rode de novo com --confirmar para gravar.'); return }

  must(await sb.from('plano_config').upsert(carga.config, { onConflict: 'household_id' }), 'gravar config')
  must(await sb.from('plano_linhas').upsert(carga.linhas, { onConflict: 'id' }), 'gravar linhas')
  for (let i = 0; i < carga.valores.length; i += 500) {
    must(await sb.from('plano_valores').upsert(carga.valores.slice(i, i + 500), { onConflict: 'linha_id,mes' }), 'gravar valores')
  }
  console.log('\nGravado. Abra o app em /#/plano para conferir.')
}

async function status() {
  const cfg = must(await sb.from('plano_config').select('*').eq('household_id', household).maybeSingle(), 'ler config')
  if (!cfg) { console.log('Household sem plano carregado.'); return }
  const linhas = must(await sb.from('plano_linhas').select('chave,grupo,rastreavel').eq('household_id', household), 'ler linhas')
  const fechados = must(await sb.from('plano_meses_fechados').select('mes').eq('household_id', household).order('mes'), 'ler meses fechados')
  const valores = must(await sb.from('plano_valores').select('linha_id', { count: 'exact', head: true }).eq('household_id', household), 'contar valores')
  console.log(JSON.stringify({
    inicio: cfg.inicio, meses: cfg.meses, pct_reserva: cfg.pct_reserva, meta_reserva_meses: cfg.meta_reserva_meses,
    linhas: linhas.length, naoRastreaveis: linhas.filter(l => !l.rastreavel).length,
    mesesFechados: fechados.map(f => f.mes), valores: valores ?? undefined,
  }, null, 2))
}

try {
  if (command === 'carregar') await carregar()
  else await status()
} catch (e) {
  fail(e.message)
}
