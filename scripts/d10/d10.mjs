#!/usr/bin/env node
// D10: migração dos dados reais (vincular lançamentos antigos às contas e reclassificar transferências).
// Uso e passo a passo: docs/D10_MIGRACAO_DADOS.md
//
//   node scripts/d10/d10.mjs lotes    --household <uuid>
//   node scripts/d10/d10.mjs contas   --household <uuid> --arquivo private/<contas>.json [--confirmar]
//   node scripts/d10/d10.mjs propor   --household <uuid> --mapeamento private/<arquivo>.json
//   node scripts/d10/d10.mjs aplicar  --household <uuid> --mapeamento <f> --proposta <f> [--confirmar]
//   node scripts/d10/d10.mjs reverter --household <uuid> --antes private/<arquivo>-antes.json
//
// Variáveis de ambiente (nunca impressas, nunca gravadas): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Os arquivos gerados ficam em private/ (fora do Git) e contêm dados reais do cliente.

import fs from 'node:fs'
import path from 'node:path'
import { createSupabaseDb } from './supabase-db.mjs'
import { suggestAccount } from './plan.mjs'
import { cmdLotes, cmdPropor, cmdAplicar, cmdContas, cmdReverter } from './commands.mjs'

const [, , command, ...rest] = process.argv
const args = {}
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const key = rest[i].slice(2)
    args[key] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true
  }
}

const fail = msg => { console.error(`Erro: ${msg}`); process.exit(1) }
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) { fail(`não consegui ler ${f}: ${e.message}`) } }
const writeJson = (f, data) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data, null, 2)); console.log(`Arquivo gravado: ${f}`) }

if (!['lotes', 'contas', 'propor', 'aplicar', 'reverter'].includes(command ?? '')) fail('comando deve ser lotes, contas, propor, aplicar ou reverter.')
const household = args.household
if (!household || household === true || !/^[0-9a-f-]{36}$/i.test(household)) fail('informe --household <uuid>.')
const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) fail('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (sem gravar em arquivo).')
const db = createSupabaseDb({ url, serviceKey })
const tag = household.slice(0, 8)

try {
  if (command === 'lotes') {
    const r = await cmdLotes({ db, household })
    console.log('\nCONTAS DO HOUSEHOLD')
    console.table(r.contas)
    console.log('LOTES SEM CONTA (encontrados = lançamentos que o vínculo por horário acharia)')
    console.table(r.lotes)
    console.log('FONTES DOS LOTES SEM CONTA (a regra "fonte~TRECHO" vincula todos os lotes cuja fonte contém o trecho)')
    console.table(r.fontes)
    console.log('MEMBROS (use o user_id como owner_user_id ao criar contas)')
    console.table(r.membros)
    console.log('GRUPOS SEM LOTE (lançamentos sem conta e sem lote; a chave vai no arquivo de mapeamento)')
    console.table(r.grupos)
    console.log(`Lançamentos sem conta: ${r.totalSemConta}`)
    const modelo = Object.fromEntries([
      ...r.fontes.map(f => [`fonte~${f.fonte}`, suggestAccount(f.fonte, r.contas)]),
      ...r.grupos.map(g => [g.chave, null]),
    ])
    const sugeridas = Object.values(modelo).filter(Boolean).length
    if (r.contas.length) console.log(`Mapeamento sugerido automaticamente para ${sugeridas} de ${r.fontes.length} fontes (só o que é inequívoco). Revise o arquivo.`)
    writeJson(`private/d10-${tag}-mapeamento.json`, modelo)
    console.log('Preencha o arquivo com o id da conta de cada lote ou grupo (null = não vincular) e rode "propor".')
  }

  if (command === 'contas') {
    if (!args.arquivo) fail('informe --arquivo <lista de contas em JSON>.')
    const confirmar = args.confirmar === true
    const r = await cmdContas({ db, household, contas: readJson(args.arquivo), confirmar })
    console.log(confirmar ? '\nContas criadas:' : '\nSIMULAÇÃO (nada foi criado; use --confirmar)')
    console.log(r)
  }

  if (command === 'propor') {
    if (!args.mapeamento) fail('informe --mapeamento <arquivo>.')
    const r = await cmdPropor({ db, household, mapping: readJson(args.mapeamento) })
    const auto = r.itens.filter(i => i.status === 'auto').length
    console.log(`Lançamentos que receberiam conta: ${r.atribuidos}`)
    console.log(`Transferências propostas: ${r.itens.length} (${auto} certas, ${r.itens.length - auto} ambíguas)`)
    for (const l of r.lotesPulados) console.log(`Lote pulado ${l.batchId}: ${l.motivo}`)
    writeJson(`private/d10-${tag}-proposta.json`, { household, geradoEm: new Date().toISOString(), itens: r.itens })
    console.log('Revise o arquivo: "aprovado": true/false em cada item. Itens certos vêm aprovados; ambíguos, reprovados.')
  }

  if (command === 'aplicar') {
    if (!args.mapeamento || !args.proposta) fail('informe --mapeamento e --proposta.')
    const confirmar = args.confirmar === true
    const r = await cmdAplicar({
      db, household, mapping: readJson(args.mapeamento), proposta: readJson(args.proposta), confirmar,
      onBefore: async antes => writeJson(`private/d10-${tag}-antes-${Date.now()}.json`, antes),
    })
    console.log(confirmar ? '\nRESULTADO' : '\nSIMULAÇÃO (nada foi gravado; use --confirmar para aplicar)')
    console.log(r)
  }

  if (command === 'reverter') {
    if (!args.antes) fail('informe --antes <arquivo>.')
    console.log(await cmdReverter({ db, household, antes: readJson(args.antes) }))
  }
} catch (e) {
  fail(e.message)
}
