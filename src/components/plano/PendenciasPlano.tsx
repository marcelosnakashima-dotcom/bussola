import { useState } from 'react'
import { CheckCircle2, Clock, MessageSquare } from 'lucide-react'
import type { Pendencia } from '@/lib/planoConteudo'
import { Secao, bordaCartao, cartao } from './PlanoSecoes'

const ROTULO_STATUS = { aberta: 'Aberta', em_analise: 'Respondida, em análise', resolvida: 'Resolvida' } as const
const COR_STATUS = {
  aberta: { bg: '#FEF3C7', fg: '#92400E' },
  em_analise: { bg: '#DBEAFE', fg: '#1E40AF' },
  resolvida: { bg: '#CFEBDA', fg: '#17221B' },
} as const

function CartaoPendencia({ p, onResponder }: { p: Pendencia; onResponder: (id: string, resposta: string) => Promise<void> }) {
  const [texto, setTexto] = useState(p.resposta ?? '')
  const [editando, setEditando] = useState(!p.resposta)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const cor = COR_STATUS[p.status]
  const podeResponder = p.responsavel === 'casal' && p.status !== 'resolvida'

  const salvar = async () => {
    setSalvando(true); setErro(null)
    try { await onResponder(p.id, texto); setEditando(false) }
    catch (e: any) { setErro(e?.message ?? 'Não foi possível salvar a resposta.') }
    finally { setSalvando(false) }
  }

  return (
    <li className={cartao} style={bordaCartao}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{p.titulo}</p>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: cor.bg, color: cor.fg }}>{ROTULO_STATUS[p.status]}</span>
      </div>
      {p.detalhe && <p className="text-sm mt-1.5" style={{ color: 'var(--muted)' }}>{p.detalhe}</p>}
      <p className="text-[11px] mt-2 flex items-center gap-1" style={{ color: 'var(--muted)' }}>
        {p.status === 'resolvida' ? <CheckCircle2 size={12} /> : p.responsavel === 'casal' ? <MessageSquare size={12} /> : <Clock size={12} />}
        {p.responsavel === 'casal' ? 'Precisamos da resposta de vocês' : 'Com a Arsen'}
      </p>

      {p.responsavel === 'casal' && podeResponder && (editando ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs" style={{ color: 'var(--muted)' }}>
            Sua resposta
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} maxLength={2000}
              className="mt-1 block w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
              placeholder="Escreva aqui o que for útil: valores, datas, nomes dos serviços…" />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={salvar} disabled={salvando || texto.trim() === ''}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
              {salvando ? 'Salvando…' : 'Enviar resposta'}
            </button>
            {p.resposta && <button onClick={() => { setTexto(p.resposta ?? ''); setEditando(false) }} className="text-sm underline" style={{ color: 'var(--muted)' }}>Cancelar</button>}
          </div>
          {erro && <p className="text-sm text-red-700">{erro}</p>}
        </div>
      ) : (
        <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: '#F5F0E8', color: 'var(--ink)' }}>
          <p className="text-[11px] mb-1" style={{ color: 'var(--muted)' }}>Resposta enviada{p.respondidoEm ? ` em ${new Date(p.respondidoEm).toLocaleDateString('pt-BR')}` : ''}</p>
          <p className="whitespace-pre-wrap">{p.resposta}</p>
          <button onClick={() => setEditando(true)} className="text-xs underline mt-2" style={{ color: 'var(--brand)' }}>Editar resposta</button>
        </div>
      ))}

      {p.responsavel === 'arsen' || p.status === 'resolvida' ? (
        p.resposta && (
          <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: '#F5F0E8', color: 'var(--ink)' }}>
            <p className="text-[11px] mb-1" style={{ color: 'var(--muted)' }}>Resposta registrada</p>
            <p className="whitespace-pre-wrap">{p.resposta}</p>
          </div>
        )
      ) : null}
    </li>
  )
}

export function SecaoPendencias({ pendencias, onResponder }: { pendencias: Pendencia[]; onResponder: (id: string, resposta: string) => Promise<void> }) {
  const abertas = pendencias.filter(p => p.status !== 'resolvida')
  const ordenadas = [...pendencias].sort((a, b) => Number(a.status === 'resolvida') - Number(b.status === 'resolvida') || a.ordem - b.ordem)
  return (
    <Secao id="pendencias" kicker="PRÓXIMOS PASSOS" titulo="O que falta para fechar o plano"
      subtitulo={abertas.length ? `${abertas.length} ${abertas.length === 1 ? 'item em aberto' : 'itens em aberto'}. Com estas informações, trocamos as estimativas por números confirmados.` : 'Tudo respondido. Obrigado!'}>
      {ordenadas.length === 0
        ? <p className="text-sm" style={{ color: 'var(--muted)' }}>Nenhuma pendência no momento.</p>
        : <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">{ordenadas.map(p => <CartaoPendencia key={p.id} p={p} onResponder={onResponder} />)}</ul>}
    </Secao>
  )
}
