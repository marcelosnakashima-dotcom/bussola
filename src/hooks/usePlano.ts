import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  addMeses, ultimoMesDoPlano,
  type PlanoConfig, type PlanoEntrada, type PlanoLinha, type PlanoValores, type RealizadoRow, type Grupo,
} from '@/lib/planoForecast'
import { lerConteudo, lerPendencias, type ConteudoPlano, type Pendencia } from '@/lib/planoConteudo'

export interface Cobertura { contasAtivas: number; contasComLote: number }

interface PlanoDados {
  entrada: PlanoEntrada
  householdId: string
  cobertura: Cobertura | null
  coberturaMes: string | null
  realizadoVisivel: boolean
  conteudo: ConteudoPlano
  pendencias: Pendencia[]
}

// Plano e realizado do household de quem está logado. O realizado vem de plano_realizado(), que soma as
// transações confirmadas (sem transferências): cada importação de extrato ou fatura atualiza o forecast.
export function usePlano() {
  const [dados, setDados] = useState<PlanoDados | null>(null)
  const [semPlano, setSemPlano] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) { setLoading(false); return }

      const { data: membro } = await supabase
        .from('household_members').select('household_id').eq('user_id', auth.user.id).maybeSingle()
      const householdId = membro?.household_id as string | undefined
      if (!householdId) { setSemPlano(true); setLoading(false); return }

      const { data: cfg, error: eCfg } = await supabase
        .from('plano_config').select('*').eq('household_id', householdId).maybeSingle()
      if (eCfg) throw eCfg
      if (!cfg) { setSemPlano(true); setLoading(false); return }

      const config: PlanoConfig = {
        inicio: String(cfg.inicio),
        meses: Number(cfg.meses),
        reservaSaldo: Number(cfg.reserva_saldo),
        pctReserva: Number(cfg.pct_reserva),
        metaReservaMeses: Number(cfg.meta_reserva_meses),
        rendaAjusteHolerite: Number(cfg.renda_ajuste_holerite),
        metaBaseExtra: Number(cfg.meta_base_extra ?? 0),
      }

      const [{ data: ls, error: eL }, { data: vs, error: eV }, { data: fs, error: eF }, cont, pend] = await Promise.all([
        supabase.from('plano_linhas').select('*').eq('household_id', householdId).order('ordem'),
        supabase.from('plano_valores').select('linha_id, mes, valor').eq('household_id', householdId).limit(5000),
        supabase.from('plano_meses_fechados').select('mes').eq('household_id', householdId),
        supabase.from('plano_conteudo').select('secao, dados').eq('household_id', householdId),
        supabase.from('plano_pendencias').select('*').eq('household_id', householdId).order('ordem'),
      ])
      if (eL) throw eL
      if (eV) throw eV
      if (eF) throw eF
      // conteúdo e pendências são complementares: se falharem (migration ainda não aplicada), a tela segue sem elas
      const conteudo = lerConteudo(cont.error ? [] : (cont.data ?? []))
      const pendencias = pend.error ? [] : lerPendencias(pend.data ?? [])

      const linhas: PlanoLinha[] = (ls ?? []).map(l => ({
        id: l.id as string,
        chave: l.chave as string,
        rotulo: l.rotulo as string,
        grupo: l.grupo as Grupo,
        categoriaIds: (l.categoria_ids ?? []) as string[],
        rastreavel: Boolean(l.rastreavel),
        semCorte: l.sem_corte == null ? null : Number(l.sem_corte),
        ordem: Number(l.ordem),
      }))
      const valores: PlanoValores = {}
      for (const v of vs ?? []) {
        const id = v.linha_id as string
        ;(valores[id] ??= {})[String(v.mes)] = Number(v.valor)
      }
      const fechados = (fs ?? []).map(f => String(f.mes))

      const ate = addMeses(ultimoMesDoPlano(config), 1)
      const { data: rl, error: eR } = await supabase.rpc('plano_realizado', {
        p_de: config.inicio,
        p_ate: ate,
      })
      if (eR) throw eR
      const realizado: RealizadoRow[] = (rl ?? []).map((r: any) => ({
        mes: String(r.mes),
        categoria_id: r.categoria_id as string | null,
        tipo: r.tipo as 'despesa' | 'receita',
        total: Number(r.total),
      }))

      // Cobertura de extratos do mês corrente (primeiro mês não fechado); melhor esforço.
      let cobertura: Cobertura | null = null
      let coberturaMes: string | null = null
      try {
        let m = config.inicio
        const set = new Set(fechados)
        while (set.has(m) && m < ultimoMesDoPlano(config)) m = addMeses(m, 1)
        coberturaMes = m
        const { data: cv } = await supabase.rpc('plano_cobertura', { p_mes: m })
        const r = Array.isArray(cv) ? cv[0] : cv
        if (r) cobertura = { contasAtivas: Number(r.contas_ativas), contasComLote: Number(r.contas_com_lote) }
      } catch { /* indicador opcional */ }

      setDados({
        entrada: { config, linhas, valores, realizado, fechados }, householdId, cobertura, coberturaMes,
        realizadoVisivel: cfg.realizado_visivel === true, conteudo, pendencias,
      })
      setSemPlano(false)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar o plano')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Só admin: a função do banco recusa qualquer outro usuário.
  const fecharMes = async (mes: string, fechar: boolean) => {
    if (!dados) return
    const { error: err } = await supabase.rpc('plano_fechar_mes', { p_household: dados.householdId, p_mes: mes, p_fechar: fechar })
    if (err) throw err
    await load()
  }

  // O casal responde a uma pendência dirigida a ele; a função do banco só aceita o household de quem chama.
  const responder = async (id: string, resposta: string) => {
    const { error: err } = await supabase.rpc('plano_responder_pendencia', { p_id: id, p_resposta: resposta })
    if (err) throw err
    await load()
  }

  return { dados, semPlano, loading, error, refresh: load, fecharMes, responder }
}
