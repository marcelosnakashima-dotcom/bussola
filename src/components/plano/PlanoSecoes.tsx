import { type ReactNode } from 'react'
import { rotuloMes } from '@/lib/planoForecast'
import type { Caixa, Corte, Diagnostico, Dividas, Metodo, Parte } from '@/lib/planoConteudo'

const PALETA = ['#17221B', '#2A6049', '#6FA58A', '#B7CFC2', '#D97706']
export const brl0 = (n: number) => (n < 0 ? '−' : '') + 'R$ ' + Math.round(Math.abs(n)).toLocaleString('pt-BR')
const soma = (p: Parte[]) => p.reduce((s, x) => s + x.valor, 0)

export function Secao({ id, kicker, titulo, subtitulo, children }: { id: string; kicker: string; titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 space-y-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.14em]" style={{ color: 'var(--brand-lt)' }}>{kicker}</p>
        <h2 className="font-display text-xl md:text-2xl mt-0.5" style={{ color: 'var(--ink)' }}>{titulo}</h2>
        {subtitulo && <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{subtitulo}</p>}
      </div>
      {children}
    </section>
  )
}

export const cartao = 'rounded-2xl border bg-white p-4 md:p-5'
export const bordaCartao = { borderColor: 'var(--border)' }

function Nota({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{children}</p>
}

// Barra empilhada com legenda e percentuais.
function BarraPartes({ partes, mostrarValor = false }: { partes: Parte[]; mostrarValor?: boolean }) {
  const total = soma(partes) || 1
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5" role="img" aria-label={partes.map(p => `${p.rotulo} ${Math.round(100 * p.valor / total)}%`).join(', ')}>
        {partes.map((p, i) => <i key={p.rotulo} style={{ width: `${(100 * p.valor) / total}%`, background: PALETA[i % PALETA.length] }} title={p.rotulo} />)}
      </div>
      <ul className="mt-2 space-y-1 text-xs" style={{ color: 'var(--ink)' }}>
        {partes.map((p, i) => (
          <li key={p.rotulo} className="flex items-center gap-2">
            <b className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PALETA[i % PALETA.length] }} />
            <span>{p.rotulo}</span>
            <span className="ml-auto" style={{ color: 'var(--muted)' }}>{mostrarValor ? brl0(p.valor) : `${Math.round(100 * p.valor / total)}%`}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── 1. Onde estamos hoje ────────────────────────────────────────────────

export function SecaoDiagnostico({ d }: { d: Diagnostico }) {
  const cards: { titulo: string; valor: string; nota?: string; partes: Parte[] }[] = [
    { titulo: 'Renda mensal após impostos', valor: brl0(d.renda.total), nota: d.renda.nota, partes: d.renda.partes },
    { titulo: 'Patrimônio cadastrado', valor: brl0(d.patrimonio.total), nota: d.patrimonio.nota, partes: d.patrimonio.partes },
    { titulo: 'Financiamentos e empréstimos', valor: brl0(d.dividas.total), nota: d.dividas.nota, partes: d.dividas.partes },
  ]
  const pc = d.parcelas
  return (
    <Secao id="onde-estamos" kicker="DIAGNÓSTICO" titulo="Onde estamos hoje" subtitulo={d.subtitulo}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.titulo} className={cartao} style={bordaCartao}>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{c.titulo}</p>
            <p className="font-display text-2xl mt-1" style={{ color: 'var(--ink)' }}>{c.valor}</p>
            {c.nota && <p className="text-xs mt-1 mb-3" style={{ color: 'var(--muted)' }}>{c.nota}</p>}
            <div className={c.nota ? '' : 'mt-3'}><BarraPartes partes={c.partes} /></div>
          </div>
        ))}
        <div className="rounded-2xl p-4 md:p-5" style={{ background: 'var(--ink)', color: '#fff' }}>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,.6)' }}>Da renda em parcelas</p>
          <p className="font-display text-2xl mt-1" style={{ color: '#73F0A1' }}>{pc.pctInicio}%</p>
          <p className="text-xs mt-1 mb-3" style={{ color: 'rgba(255,255,255,.7)' }}>
            {brl0(pc.valorInicio)} por mês em {pc.rotuloInicio}, caindo para {pc.pctFim}% em {pc.rotuloFim}{pc.nota ? `, ${pc.nota.charAt(0).toLowerCase()}${pc.nota.slice(1)}` : ''}
          </p>
          {[[pc.rotuloInicio, pc.pctInicio, '#73F0A1'], [pc.rotuloFim, pc.pctFim, '#52DA84']].map(([rot, p, cor]) => (
            <div key={String(rot)} className="flex items-center gap-2 text-xs mt-1.5">
              <span className="w-12 shrink-0" style={{ color: 'rgba(255,255,255,.7)' }}>{rot}</span>
              <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.16)' }}>
                <i className="block h-full rounded-full" style={{ width: `${Math.min(100, Number(p))}%`, background: String(cor) }} />
              </div>
              <b className="w-9 text-right">{p}%</b>
            </div>
          ))}
        </div>
      </div>
      {d.rodape && <Nota>* {d.rodape}</Nota>}
    </Secao>
  )
}

// ─── 2. Método ───────────────────────────────────────────────────────────

export function SecaoMetodo({ m }: { m: Metodo }) {
  const cores = ['#2A6049', '#D97706', '#2563EB']
  return (
    <Secao id="metodo" kicker="MÉTODO" titulo="50/30/20, adaptado ao casal" subtitulo={m.subtitulo}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {m.blocos.map((b, i) => (
          <div key={b.titulo} className={cartao} style={{ ...bordaCartao, borderTop: `4px solid ${cores[i % cores.length]}` }}>
            <p className="font-display text-3xl" style={{ color: cores[i % cores.length] }}>{b.pct}</p>
            <p className="font-semibold mt-1" style={{ color: 'var(--ink)' }}>{b.titulo}</p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{b.descricao}</p>
          </div>
        ))}
      </div>
      {m.ordem.length > 0 && (
        <div className={cartao} style={bordaCartao}>
          <p className="text-[11px] font-semibold tracking-[0.14em] mb-3" style={{ color: 'var(--brand-lt)' }}>COMO USAMOS O FUTURO, NESTA ORDEM</p>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {m.ordem.map((o, i) => (
              <li key={o.titulo} className="flex gap-3">
                <span className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: '#CFEBDA', color: 'var(--ink)' }}>{i + 1}</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{o.titulo}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{o.descricao}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Secao>
  )
}

// ─── 3. Caixa e plano de corte ───────────────────────────────────────────

function BarraCaixa({ titulo, partes, max }: { titulo: string; partes: Parte[]; max: number }) {
  const total = soma(partes)
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold tracking-[0.1em]" style={{ color: 'var(--brand-lt)' }}>{titulo}</span>
        <span style={{ color: 'var(--muted)' }}>{brl0(total)}</span>
      </div>
      <div className="mt-1.5 h-9 flex rounded-lg overflow-hidden gap-0.5" style={{ width: `${(100 * total) / max}%` }}>
        {partes.map((p, i) => {
          const w = (100 * p.valor) / total
          const claro = i % PALETA.length >= 2 && i % PALETA.length !== 4
          return (
            <div key={p.rotulo} className="flex items-center justify-center text-[11px] font-semibold overflow-hidden" title={`${p.rotulo}: ${brl0(p.valor)}`}
              style={{ width: `${w}%`, background: PALETA[i % PALETA.length], color: claro ? 'var(--ink)' : '#fff' }}>
              {w > 14 ? Math.round(p.valor / 100) / 10 + ' mil' : ''}
            </div>
          )
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--ink)' }}>
        {partes.map((p, i) => (
          <li key={p.rotulo} className="flex items-center gap-1.5">
            <b className="w-2.5 h-2.5 rounded-full" style={{ background: PALETA[i % PALETA.length] }} />{p.rotulo} <span style={{ color: 'var(--muted)' }}>{brl0(p.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SecaoCaixa({ c }: { c: Caixa }) {
  const max = Math.max(soma(c.entra), soma(c.sai)) || 1
  return (
    <Secao id="caixa" kicker="CAIXA" titulo="Como o dinheiro entra e sai" subtitulo={c.subtitulo}>
      <div className={`${cartao} space-y-5`} style={bordaCartao}>
        <BarraCaixa titulo="ENTRA · RENDA LÍQUIDA DO CASAL" partes={c.entra} max={max} />
        <BarraCaixa titulo="SAI · PARCELAS E GASTOS" partes={c.sai} max={max} />
        {c.rendaTipica != null && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Renda típica do extrato (média do que cai na conta): <b style={{ color: 'var(--ink)' }}>{brl0(c.rendaTipica)}</b></p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {c.resultados.map((r, i) => (
          <div key={r.rotulo} className="rounded-2xl p-4" style={i === 1 ? { background: 'var(--ink)', color: '#fff' } : { background: i === 2 ? '#CFEBDA' : '#EFEAE0', color: 'var(--ink)' }}>
            <p className="font-display text-2xl" style={i === 1 ? { color: r.valor < 0 ? '#FCA5A5' : '#73F0A1' } : undefined}>{brl0(r.valor)}</p>
            <p className="text-xs mt-1" style={{ color: i === 1 ? 'rgba(255,255,255,.75)' : 'var(--muted)' }}>{r.rotulo}</p>
          </div>
        ))}
      </div>
      {c.nota && <Nota>{c.nota}</Nota>}
    </Secao>
  )
}

export function SecaoCorte({ c }: { c: Corte }) {
  return (
    <Secao id="corte" kicker="AÇÃO" titulo="Plano de corte nos desejos" subtitulo={c.subtitulo}>
      <div className={`${cartao} !p-0 overflow-hidden`} style={bordaCartao}>
        {c.linhas.map((l, i) => (
          <div key={l.categoria} className="grid gap-x-4 gap-y-1 p-4 md:grid-cols-[1.3fr_1fr_1fr_0.8fr_2fr] md:items-center" style={{ borderTop: i ? '1px solid var(--border)' : undefined }}>
            <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{l.categoria}</p>
            <p className="text-sm" style={{ color: 'var(--ink)' }}>
              <span className="md:hidden text-xs" style={{ color: 'var(--muted)' }}>Hoje: </span>
              {l.hoje != null ? brl0(l.hoje) : 'a medir'}
              {l.hojeNota && <span className="block text-[11px]" style={{ color: 'var(--muted)' }}>{l.hojeNota}</span>}
            </p>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              <span className="md:hidden text-xs font-normal" style={{ color: 'var(--muted)' }}>Teto: </span>
              {l.teto != null ? brl0(l.teto) : l.tetoTexto ?? 'a definir'}
            </p>
            <p>
              {l.economia > 0
                ? <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#CFEBDA', color: 'var(--ink)' }}>−{brl0(l.economia)}</span>
                : <span style={{ color: 'var(--muted)' }}>—</span>}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{l.como}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl p-4 md:p-5 grid gap-3 md:grid-cols-2 md:items-center" style={{ background: 'var(--ink)', color: '#fff' }}>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em]" style={{ color: '#73F0A1' }}>DESEJOS POR MÊS</p>
          <p className="font-display text-2xl mt-0.5">{brl0(c.totalHoje)} <span style={{ color: '#73F0A1' }}>→</span> {brl0(c.totalTeto)}</p>
        </div>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,.85)' }}>
          Com a renda típica do extrato, o resultado do mês passa de <b style={{ color: '#FCA5A5' }}>{brl0(c.resultadoAntes)}</b> para <b style={{ color: '#73F0A1' }}>{c.resultadoDepois >= 0 ? '+' : ''}{brl0(c.resultadoDepois)}</b>.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {c.fases.map(f => (
          <div key={f.periodo} className="rounded-2xl p-4" style={{ background: '#EFEAE0' }}>
            <p className="text-[11px] font-semibold tracking-[0.1em]" style={{ color: 'var(--brand-lt)' }}>{f.periodo.toUpperCase()}</p>
            <p className="font-display text-xl mt-0.5" style={{ color: 'var(--ink)' }}>{brl0(f.teto)}</p>
          </div>
        ))}
      </div>
      {c.nota && <Nota>{c.nota}</Nota>}
    </Secao>
  )
}

// ─── 4. Dívidas: o que termina e quando ──────────────────────────────────

function mesesEntre(a: string, b: string) {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)))
}

export function SecaoDividas({ d, inicio }: { d: Dividas; inicio: string }) {
  const donos = [...new Set(d.itens.map(i => i.dono))]
  const cor = (dono: string) => (donos.indexOf(dono) === 0 ? '#2A6049' : '#6FA58A')
  const total = Math.max(1, ...d.itens.map(i => mesesEntre(inicio, i.fim) + 1))
  const anos: number[] = []
  const a0 = Number(inicio.slice(0, 4)), a1 = Number(d.itens.reduce((m, i) => (i.fim > m ? i.fim : m), inicio).slice(0, 4))
  for (let a = a0 + 1; a <= a1; a++) anos.push(a)
  return (
    <Secao id="dividas" kicker="DÍVIDAS" titulo="O que termina e quando" subtitulo={d.subtitulo}>
      <div className={cartao} style={bordaCartao}>
        <div className="flex gap-4 text-xs mb-3" style={{ color: 'var(--ink)' }}>
          {donos.map(o => <span key={o} className="flex items-center gap-1.5"><b className="w-2.5 h-2.5 rounded-full" style={{ background: cor(o) }} />{o}</span>)}
        </div>
        <div className="relative">
          <div className="relative h-5 text-[11px]" style={{ color: 'var(--muted)' }}>
            {anos.map(a => {
              const left = (100 * mesesEntre(inicio, `${a}-01-01`)) / total
              return left <= 100 ? <span key={a} className="absolute -translate-x-1/2" style={{ left: `${left}%` }}>{a}</span> : null
            })}
          </div>
          <div className="space-y-3">
            {d.itens.map(i => {
              const w = (100 * (mesesEntre(inicio, i.fim) + 1)) / total
              return (
                <div key={i.rotulo}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>{i.rotulo}</span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>até {rotuloMes(i.fim)}{i.estimado ? ' *' : ''}</span>
                  </div>
                  <div className="h-3 rounded-full mt-1" style={{ background: '#EFEAE0' }}>
                    <i className="block h-full rounded-full" style={{ width: `${w}%`, background: cor(i.dono) }} />
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>{i.detalhe}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <Nota>{d.nota ?? 'Cada parcela que termina libera dinheiro para a reserva e para os investimentos.'}{d.itens.some(i => i.estimado) ? ' * Prazo estimado (saldo dividido pela parcela, ou hipótese a confirmar).' : ''}</Nota>
    </Secao>
  )
}

// ─── Como acompanhamos ───────────────────────────────────────────────────

export function SecaoAcompanhamento() {
  const passos = [
    { t: 'Todo mês', d: 'Vocês enviam os extratos e as faturas pelo aplicativo (Importar despesas), e o realizado se atualiza sozinho.' },
    { t: 'Revisão da Arsen', d: 'Conferimos a classificação e fechamos o mês com o realizado de receitas e despesas.' },
    { t: 'Forecast atualizado', d: 'A janela avança um mês e recalculamos os próximos 12 meses, por cenário.' },
    { t: 'Decisões', d: 'Ajustamos tetos, parcelas e reserva com os números na mesa.' },
  ]
  return (
    <Secao id="acompanhamento" kicker="ACOMPANHAMENTO" titulo="Como vamos acompanhar o plano" subtitulo="Os extratos de vocês atualizam o realizado e o forecast dos próximos 12 meses.">
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {passos.map((p, i) => (
          <li key={p.t} className={cartao} style={bordaCartao}>
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: '#CFEBDA', color: 'var(--ink)' }}>{i + 1}</span>
            <p className="font-semibold text-sm mt-2" style={{ color: 'var(--ink)' }}>{p.t}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{p.d}</p>
          </li>
        ))}
      </ol>
    </Secao>
  )
}
