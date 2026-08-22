import { useState } from 'react'
import { Home, Car, Plane, Check, TrendingDown } from 'lucide-react'
import { supabase, formatBRL } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { compararBem, PRESETS, type TipoBem, type Modalidade } from '@/lib/simulador'

const ICONS: Record<TipoBem, typeof Home> = { imovel: Home, carro: Car, viagem: Plane }
const TIPOS: TipoBem[] = ['imovel', 'carro', 'viagem']

export function SimuladorPage() {
  const { user } = useAuth()
  const [tipoBem, setTipoBem]           = useState<TipoBem>('imovel')
  const [valorCentavos, setValorCentavos] = useState('')
  const [nomeBem, setNomeBem]           = useState('')
  const [diaVencimento, setDiaVencimento] = useState('10')
  const [contratando, setContratando]   = useState<Modalidade | null>(null)
  const [contratado, setContratado]     = useState<Modalidade | null>(null)
  const [erro, setErro]                 = useState<string | null>(null)

  const valor    = valorCentavos ? parseInt(valorCentavos, 10) / 100 : 0
  const preset   = PRESETS[tipoBem]
  const comparativo = valor > 0 ? compararBem(tipoBem, valor) : null

  const handleTipoChange = (tipo: TipoBem) => {
    setTipoBem(tipo)
    setContratado(null)
    setErro(null)
  }

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '')
    setValorCentavos(digits)
    setContratado(null)
  }

  const contratar = async (modalidade: Modalidade) => {
    if (!user || !comparativo) return
    setContratando(modalidade)
    setErro(null)
    try {
      const parcela = modalidade === 'financiamento'
        ? comparativo.financiamento.parcelaInicial
        : comparativo.consorcio.parcelaInicial
      const custoTotal = modalidade === 'financiamento'
        ? comparativo.financiamento.totalPago + comparativo.financiamento.entrada
        : comparativo.consorcio.custoTotalEstimado
      const prazo = modalidade === 'financiamento' ? preset.financiamento.prazoMeses : preset.consorcio.prazoMeses
      const nome  = nomeBem.trim() || preset.label
      const descricao = `${modalidade === 'financiamento' ? 'Financiamento' : 'Consórcio'} — ${nome}`

      const { data: expense, error: expError } = await supabase
        .from('recurring_expenses')
        .insert({
          user_id: user.id,
          description: descricao,
          category: preset.label,
          amount: Math.round(parcela * 100) / 100,
          due_day: Math.min(28, Math.max(1, parseInt(diaVencimento, 10) || 10)),
          active: true,
        })
        .select()
        .single()
      if (expError) throw expError

      const { error: simError } = await supabase.from('simulacoes').insert({
        user_id: user.id,
        tipo_bem: tipoBem,
        nome_bem: nome,
        valor_bem: valor,
        modalidade,
        prazo_meses: prazo,
        parcela_inicial: parcela,
        custo_total_estimado: custoTotal,
        contratado: true,
        recurring_expense_id: expense.id,
      })
      if (simError) throw simError

      setContratado(modalidade)
    } catch {
      setErro('Não foi possível registrar agora. Tenta de novo em instantes.')
    }
    setContratando(null)
  }

  return (
    <div className="p-4 md:p-8 max-w-screen-lg mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>
          Simulador: financiamento x consórcio
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
          Compare o custo de comprar via banco ou via consórcio.
        </p>
      </div>

      {/* Seletor de produto */}
      <div className="grid grid-cols-3 gap-2">
        {TIPOS.map(tipo => {
          const Icon   = ICONS[tipo]
          const active = tipoBem === tipo
          return (
            <button key={tipo} onClick={() => handleTipoChange(tipo)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border text-sm font-medium transition-colors"
              style={{
                borderColor: active ? 'var(--brand)' : 'var(--border)',
                background:  active ? 'var(--brand)' : 'white',
                color:       active ? 'white' : 'var(--ink)',
              }}>
              <Icon className="w-5 h-5" />
              {PRESETS[tipo].label}
            </button>
          )
        })}
      </div>

      {/* Inputs */}
      <div className="rounded-2xl border bg-white p-5 space-y-4" style={{ borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>
              Nome (opcional)
            </label>
            <input type="text" value={nomeBem} onChange={e => setNomeBem(e.target.value)}
              placeholder={`Ex: ${preset.label} próprio`}
              className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: 'var(--border)' }} />
          </div>
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>
              Dia de vencimento
            </label>
            <input type="number" min="1" max="28" value={diaVencimento}
              onChange={e => setDiaVencimento(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: 'var(--border)' }} />
          </div>
        </div>
        <div>
          <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>
            Valor do bem (R$)
          </label>
          <input
            type="text" inputMode="numeric"
            value={valor > 0 ? formatBRL(valor) : ''}
            onChange={handleValorChange}
            placeholder="R$ 0,00"
            className="w-full border rounded-xl px-3 py-3 text-lg font-display outline-none"
            style={{ borderColor: 'var(--border)', color: 'var(--ink)' }} />
        </div>
      </div>

      {comparativo && (
        <>
          {/* Diferença — destaque grande */}
          {(() => {
            const custoFin  = comparativo.financiamento.totalPago + comparativo.financiamento.entrada
            const custoCons = comparativo.consorcio.custoTotalEstimado
            const diff = Math.abs(custoFin - custoCons)
            const maiorCusto = Math.max(custoFin, custoCons)
            const pct = maiorCusto > 0 ? (diff / maiorCusto) * 100 : 0
            const consorcioGanha = custoCons < custoFin
            const corDestaque = consorcioGanha ? 'var(--brand)' : '#2563EB'
            const maisBarato = consorcioGanha ? 'O consórcio' : 'O financiamento'

            return (
              <div className="rounded-2xl p-6 md:p-8 text-center" style={{ background: corDestaque }}>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <TrendingDown className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.9)' }} />
                  <span className="text-xs md:text-sm font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    {maisBarato} sai mais barato nessa simulação
                  </span>
                </div>
                <p className="font-display text-4xl md:text-6xl text-white leading-none">
                  {formatBRL(diff)}
                </p>
                <p className="text-sm md:text-base mt-3" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  de economia no total — {pct.toFixed(0)}% a menos
                </p>
              </div>
            )
          })()}

          <div className="grid md:grid-cols-2 gap-4">
            {/* Financiamento */}
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)', borderLeft: '4px solid #2563EB' }}>
              <h3 className="font-medium mb-3" style={{ color: 'var(--ink)' }}>🏦 Financiamento bancário</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Entrada</span>
                  <span className="font-mono">{formatBRL(comparativo.financiamento.entrada)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Parcela inicial</span>
                  <span className="font-mono font-medium">{formatBRL(comparativo.financiamento.parcelaInicial)}/mês</span>
                </div>
                {preset.financiamento.sistema === 'SAC' && (
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--muted)' }}>Parcela final</span>
                    <span className="font-mono">{formatBRL(comparativo.financiamento.parcelaFinal)}/mês</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Prazo</span>
                  <span className="font-mono">{preset.financiamento.prazoMeses} meses</span>
                </div>
                <div className="flex justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--muted)' }}>Custo total</span>
                  <span className="font-display text-lg" style={{ color: '#2563EB' }}>
                    {formatBRL(comparativo.financiamento.totalPago + comparativo.financiamento.entrada)}
                  </span>
                </div>
              </div>
              <button onClick={() => contratar('financiamento')} disabled={contratando !== null || !user}
                className="w-full mt-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60 flex items-center justify-center gap-1.5"
                style={{ background: '#2563EB' }}>
                {contratado === 'financiamento'
                  ? <><Check className="w-4 h-4" /> Adicionado às despesas</>
                  : contratando === 'financiamento' ? 'Adicionando...' : 'Contratar este plano'}
              </button>
            </div>

            {/* Consórcio */}
            <div className="rounded-2xl border bg-white p-5" style={{ borderColor: 'var(--border)', borderLeft: '4px solid var(--brand)' }}>
              <h3 className="font-medium mb-3" style={{ color: 'var(--ink)' }}>🤝 Consórcio</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Taxas (adm. + reserva)</span>
                  <span className="font-mono">{formatBRL(comparativo.consorcio.taxasTotais)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Parcela inicial</span>
                  <span className="font-mono font-medium">{formatBRL(comparativo.consorcio.parcelaInicial)}/mês</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Prazo</span>
                  <span className="font-mono">{preset.consorcio.prazoMeses} meses</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--muted)' }}>Contemplação</span>
                  <span className="text-xs text-right" style={{ color: 'var(--muted)' }}>sorteio/lance — sem prazo garantido</span>
                </div>
                <div className="flex justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--muted)' }}>Custo total estimado</span>
                  <span className="font-display text-lg" style={{ color: 'var(--brand)' }}>
                    {formatBRL(comparativo.consorcio.custoTotalEstimado)}
                  </span>
                </div>
              </div>
              <button onClick={() => contratar('consorcio')} disabled={contratando !== null || !user}
                className="w-full mt-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60 flex items-center justify-center gap-1.5"
                style={{ background: 'var(--brand)' }}>
                {contratado === 'consorcio'
                  ? <><Check className="w-4 h-4" /> Adicionado às despesas</>
                  : contratando === 'consorcio' ? 'Adicionando...' : 'Contratar este plano'}
              </button>
            </div>
          </div>

          {erro && <p className="text-sm text-red-600 text-center">{erro}</p>}

          <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
            Valores estimados com taxas médias de mercado — não são uma oferta ou cotação oficial.
            Confirme as condições reais com o banco ou a administradora escolhida antes de decidir.
          </p>
        </>
      )}
    </div>
  )
}
