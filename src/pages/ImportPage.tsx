import { useState, useRef, useCallback } from 'react'
import { Upload, CheckCircle, AlertCircle, X, RefreshCw, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { useTransactions, useCategories } from '@/hooks/useData'
import { formatBRL, formatDate } from '@/lib/supabase'

type Step = 1 | 2 | 3 | 4

interface ImportItem {
  id: string
  descricao: string
  data: string
  valor: number
  tipo: 'despesa' | 'receita'
  categoriaId: string | null
  categoriaNome: string | null
  categoriaNomeOriginal: string | null  // categoria original do Claude
  categoriaIdOriginal: string | null
  confianca: 'alta' | 'media' | 'revisar'
  justificativa: string
  selected: boolean
  corrected: boolean  // usuário alterou a categoria
}

interface ParseResult {
  fonte: string
  periodo: { inicio: string; fim: string } | null
  total_despesas: number
  total_receitas: number
}

const CONFIANCA_STYLE = {
  alta:    { bg: '#DCFCE7', text: '#15803D', label: 'ALTA' },
  media:   { bg: '#FEF3C7', text: '#92400E', label: 'MÉDIA' },
  revisar: { bg: '#FEE2E2', text: '#991B1B', label: 'REVISAR' },
}

export function ImportPage() {
  const [step,       setStep]       = useState<Step>(1)
  const [items,      setItems]      = useState<ImportItem[]>([])
  const [result,     setResult]     = useState<ParseResult | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [reloading,  setReloading]  = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [pdfBase64,  setPdfBase64]  = useState<string | null>(null)
  const [showJust,   setShowJust]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { bulkInsert }                  = useTransactions()
  const { categories }                  = useCategories()

  // ── Converte File → base64
  const toBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onload  = () => res((reader.result as string).split(',')[1])
      reader.onerror = rej
      reader.readAsDataURL(file)
    })

  // ── Chama Edge Function parse-pdf
  const callParseEdge = useCallback(async (
    base64: string,
    corrections: { descricao: string; de: string; para: string }[] = [],
    isRevalidation = false
  ) => {
    const supaUrl = import.meta.env.VITE_SUPABASE_URL
    const resp = await fetch(`${supaUrl}/functions/v1/parse-pdf`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdf_base64:     base64,
        corrections,
        is_revalidation: isRevalidation,
      }),
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Erro desconhecido' }))
      throw new Error(err.error ?? `HTTP ${resp.status}`)
    }
    return resp.json()
  }, [])

  // ── Upload e extração inicial
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      setError('Por favor envie um arquivo PDF.')
      return
    }
    setLoading(true)
    setError(null)
    setStep(2)

    try {
      const base64 = await toBase64(file)
      setPdfBase64(base64)
      const data = await callParseEdge(base64)

      const parsed: ImportItem[] = (data.transacoes ?? []).map((t: any) => ({
        id:                    t.id,
        descricao:             t.descricao,
        data:                  t.data,
        valor:                 t.valor,
        tipo:                  t.tipo,
        categoriaId:           t.categoria_id,
        categoriaNome:         t.categoria_nome,
        categoriaIdOriginal:   t.categoria_id,
        categoriaNomeOriginal: t.categoria_nome,
        confianca:             t.confianca,
        justificativa:         t.justificativa,
        selected:              true,
        corrected:             false,
      }))

      setItems(parsed)
      setResult({
        fonte:          data.fonte,
        periodo:        data.periodo,
        total_despesas: data.total_despesas,
        total_receitas: data.total_receitas,
      })
      setStep(3)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao processar o PDF.')
      setStep(1)
    } finally {
      setLoading(false)
    }
  }

  // ── Revalidar com Claude usando as correções do usuário
  const revalidate = async () => {
    if (!pdfBase64) return
    const corrections = items
      .filter(i => i.corrected && i.categoriaIdOriginal !== i.categoriaId)
      .map(i => ({
        descricao: i.descricao,
        de:        i.categoriaNomeOriginal ?? i.categoriaIdOriginal ?? '',
        para:      i.categoriaNome ?? i.categoriaId ?? '',
      }))

    if (corrections.length === 0) return

    setReloading(true)
    try {
      const data = await callParseEdge(pdfBase64, corrections, true)
      const updated: ImportItem[] = (data.transacoes ?? []).map((t: any) => {
        const existing = items.find(i => i.descricao === t.descricao && i.data === t.data && i.valor === t.valor)
        // Mantém correções manuais do usuário
        if (existing?.corrected) return existing
        return {
          id:                    t.id ?? existing?.id ?? crypto.randomUUID(),
          descricao:             t.descricao,
          data:                  t.data,
          valor:                 t.valor,
          tipo:                  t.tipo,
          categoriaId:           t.categoria_id,
          categoriaNome:         t.categoria_nome,
          categoriaIdOriginal:   t.categoria_id,
          categoriaNomeOriginal: t.categoria_nome,
          confianca:             t.confianca,
          justificativa:         t.justificativa,
          selected:              existing?.selected ?? true,
          corrected:             false,
        }
      })
      setItems(updated)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setReloading(false)
    }
  }

  // ── Alterar categoria de um item
  const setCategory = (id: string, catId: string) => {
    const cat = categories.find(c => c.id === catId)
    setItems(prev => prev.map(i =>
      i.id !== id ? i : {
        ...i,
        categoriaId:   catId || null,
        categoriaNome: cat?.nome ?? null,
        corrected:     true,
        confianca:     'alta', // usuário confirmou
      }
    ))
  }

  const selectedItems   = items.filter(i => i.selected)
  const allCategorized  = selectedItems.every(i => i.categoriaId)
  const corrections     = items.filter(i => i.corrected && i.categoriaIdOriginal !== i.categoriaId)
  const totalSelected   = selectedItems.reduce((s, i) => s + i.valor, 0)
  const needsReview     = items.filter(i => i.confianca === 'revisar' && !i.corrected).length

  const confirm = async () => {
    if (!allCategorized) return
    setLoading(true)
    try {
      await bulkInsert(selectedItems.map(i => ({
        data:        i.data,
        descricao:   i.descricao,
        categoria_id: i.categoriaId,
        tipo:        i.tipo,
        valor:       i.valor,
        origem:      'pdf' as const,
        status:      'confirmada' as const,
        confianca:   i.confianca,
      })))
      setStep(4)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => { setStep(1); setItems([]); setResult(null); setError(null); setPdfBase64(null) }

  const STEPS = ['Upload', 'Extraindo', 'Revisão', 'Concluído']

  return (
    <div className="p-4 md:p-8 max-w-screen-xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>
          Importar despesas
        </h1>
        <p className="text-sm mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} />
          Categorização automática com Claude AI · revisão e correção incluídas
        </p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2 flex-wrap">
        {STEPS.map((label, i) => {
          const n = (i + 1) as Step
          const done = n < step; const active = n === step
          return (
            <div key={n} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0`}
                style={{ background: done ? 'var(--brand)' : active ? 'var(--ink)' : 'var(--border)', color: done || active ? '#fff' : 'var(--muted)' }}>
                {done ? '✓' : n}
              </div>
              <span className={`text-xs hidden sm:block ${active ? 'font-medium' : ''}`}
                style={{ color: active ? 'var(--ink)' : 'var(--muted)' }}>{label}</span>
              {i < STEPS.length - 1 && <div className="h-px w-4 mx-1" style={{ background: 'var(--border)' }} />}
            </div>
          )
        })}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div
          onClick={() => fileRef.current?.click()}
          className="rounded-2xl border-2 border-dashed p-14 text-center cursor-pointer hover:border-brand transition-colors"
          style={{ borderColor: 'var(--border)' }}
          onDragOver={e => { e.preventDefault() }}
          onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) { const dt = new DataTransfer(); dt.items.add(file); if (fileRef.current) { fileRef.current.files = dt.files; handleFile({ target: fileRef.current } as any) } } }}>
          <Upload className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--muted)' }} />
          <p className="font-medium text-lg mb-1" style={{ color: 'var(--ink)' }}>
            Arraste ou clique para enviar
          </p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Fatura de cartão ou extrato bancário em PDF
          </p>
          <div className="flex items-center justify-center gap-2 mt-4 text-xs" style={{ color: 'var(--muted)' }}>
            <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} />
            Claude lê o PDF, extrai e categoriza automaticamente
          </div>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
        </div>
      )}

      {/* Step 2: Loading */}
      {step === 2 && (
        <div className="rounded-2xl border bg-white p-14 text-center" style={{ borderColor: 'var(--border)' }}>
          <div className="relative w-16 h-16 mx-auto mb-5">
            <div className="w-16 h-16 rounded-full border-4 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }} />
            <Sparkles className="w-6 h-6 absolute inset-0 m-auto" style={{ color: 'var(--brand)' }} />
          </div>
          <p className="font-medium text-lg" style={{ color: 'var(--ink)' }}>Claude está lendo seu PDF</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Extraindo transações e categorizando com inteligência artificial...
          </p>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <>
          {/* Metadata bar */}
          {result && (
            <div className="flex items-center gap-4 flex-wrap text-sm" style={{ color: 'var(--muted)' }}>
              <span className="font-medium" style={{ color: 'var(--ink)' }}>📄 {result.fonte}</span>
              {result.periodo && <span>{formatDate(result.periodo.inicio)} – {formatDate(result.periodo.fim)}</span>}
              <span className="font-mono">{items.length} transações</span>
              {needsReview > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: '#FEF3C7', color: '#92400E' }}>
                  ⚠ {needsReview} para revisar
                </span>
              )}
            </div>
          )}

          {/* Revalidate banner */}
          {corrections.length > 0 && (
            <div className="rounded-xl border px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
              style={{ background: '#F0FDF4', borderColor: '#86EFAC' }}>
              <p className="text-sm text-green-800">
                <strong>{corrections.length} correção{corrections.length > 1 ? 'ões' : ''}</strong> feita{corrections.length > 1 ? 's' : ''} por você.
                Quer que o Claude aprenda e recategorize transações similares?
              </p>
              <button onClick={revalidate} disabled={reloading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                style={{ background: 'var(--brand)' }}>
                <RefreshCw className={`w-3.5 h-3.5 ${reloading ? 'animate-spin' : ''}`} />
                {reloading ? 'Recategorizando...' : 'Revalidar com Claude'}
              </button>
            </div>
          )}

          {items.length === 0 ? (
            <div className="rounded-2xl border bg-white p-12 text-center" style={{ borderColor: 'var(--border)' }}>
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-amber-500" />
              <p className="font-medium mb-2" style={{ color: 'var(--ink)' }}>Nenhuma transação encontrada</p>
              <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                O Claude não conseguiu extrair dados deste PDF. Verifique se é um extrato ou fatura válida.
              </p>
              <button onClick={reset} className="px-5 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: 'var(--brand)' }}>
                Tentar outro arquivo
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              {/* Table header */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border)', background: '#FAFAF8' }}>
                      <th className="w-10 px-3 py-3 text-left">
                        <input type="checkbox"
                          checked={items.every(i => i.selected)}
                          onChange={e => setItems(items.map(i => ({ ...i, selected: e.target.checked })))}
                        />
                      </th>
                      <th className="px-3 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>DESCRIÇÃO</th>
                      <th className="px-3 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>DATA</th>
                      <th className="px-3 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>IA</th>
                      <th className="px-3 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>CATEGORIA</th>
                      <th className="px-3 py-3 text-right text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>VALOR</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const conf = CONFIANCA_STYLE[item.confianca]
                      return (
                        <>
                          <tr key={item.id}
                            className="border-b hover:bg-gray-50 transition-colors"
                            style={{
                              borderColor: 'var(--border)',
                              borderLeft: item.confianca === 'revisar' && !item.corrected ? '3px solid #D97706' : '3px solid transparent',
                              opacity: item.selected ? 1 : 0.5,
                            }}>
                            <td className="px-3 py-2.5">
                              <input type="checkbox" checked={item.selected}
                                onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, selected: e.target.checked } : i))} />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-medium" style={{ color: 'var(--ink)' }}>{item.descricao}</div>
                              {item.corrected && (
                                <div className="text-[10px] mt-0.5" style={{ color: 'var(--brand)' }}>
                                  ✓ corrigido por você
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs" style={{ color: 'var(--muted)' }}>
                              {formatDate(item.data)}
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                onClick={() => setShowJust(showJust === item.id ? null : item.id)}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                                style={{ background: conf.bg, color: conf.text }}>
                                {conf.label}
                                {item.justificativa && (showJust === item.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                              </button>
                            </td>
                            <td className="px-3 py-2.5">
                              <select
                                value={item.categoriaId ?? ''}
                                className={`border rounded-lg px-2 py-1 text-xs outline-none max-w-[180px] ${!item.categoriaId ? 'border-amber-400 bg-amber-50' : ''}`}
                                style={{ borderColor: item.categoriaId ? 'var(--border)' : '#F59E0B' }}
                                onChange={e => setCategory(item.id, e.target.value)}>
                                <option value="">Selecione...</option>
                                {categories.map(c => (
                                  <option key={c.id} value={c.id}>{c.nome}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-medium"
                              style={{ color: item.tipo === 'despesa' ? '#DC2626' : '#16A34A' }}>
                              {item.tipo === 'despesa' ? '-' : '+'}{formatBRL(item.valor)}
                            </td>
                            <td className="px-3 py-2.5">
                              <button onClick={() => setItems(items.filter(i => i.id !== item.id))}
                                className="p-1 hover:bg-red-50 rounded transition-colors">
                                <X className="w-4 h-4 text-red-400" />
                              </button>
                            </td>
                          </tr>
                          {showJust === item.id && item.justificativa && (
                            <tr key={`${item.id}-just`}>
                              <td colSpan={7} className="px-5 py-2 text-xs italic border-b"
                                style={{ background: '#FFFBEB', color: '#78350F', borderColor: 'var(--border)' }}>
                                💡 <strong>Claude:</strong> {item.justificativa}
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer bar */}
              <div className="sticky bottom-0 px-5 py-3 border-t flex items-center justify-between gap-4 flex-wrap"
                style={{ background: '#fff', borderColor: 'var(--border)' }}>
                <div className="text-sm" style={{ color: 'var(--muted)' }}>
                  {selectedItems.length} de {items.length} selecionadas ·{' '}
                  <span className="font-medium" style={{ color: 'var(--ink)' }}>
                    {formatBRL(totalSelected)}
                  </span>
                </div>
                {!allCategorized && (
                  <p className="text-xs font-medium" style={{ color: '#D97706' }}>
                    Selecione a categoria de todos os itens antes de confirmar
                  </p>
                )}
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={reset} className="px-4 py-2 rounded-xl text-sm border"
                    style={{ borderColor: 'var(--border)' }}>Cancelar</button>
                  <button onClick={confirm} disabled={!allCategorized || loading || selectedItems.length === 0}
                    className="px-5 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--brand)' }}>
                    {loading ? 'Salvando...' : `Confirmar ${selectedItems.length} despesa${selectedItems.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Step 4: Done */}
      {step === 4 && (
        <div className="rounded-2xl border bg-white p-14 text-center" style={{ borderColor: 'var(--border)' }}>
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-600" />
          <p className="font-display text-3xl mb-2" style={{ color: 'var(--ink)' }}>
            {selectedItems.length} despesa{selectedItems.length !== 1 ? 's' : ''} importada{selectedItems.length !== 1 ? 's' : ''}!
          </p>
          <p className="text-sm mb-2" style={{ color: 'var(--muted)' }}>
            Total de {formatBRL(totalSelected)} adicionado ao seu mês.
          </p>
          {corrections.length > 0 && (
            <p className="text-sm mb-6" style={{ color: 'var(--brand)' }}>
              ✓ {corrections.length} correção{corrections.length > 1 ? 'ões' : ''} registrada{corrections.length > 1 ? 's' : ''} — Claude aprenderá com elas nas próximas importações.
            </p>
          )}
          <button onClick={reset} className="px-6 py-2.5 rounded-xl text-sm font-medium text-white"
            style={{ background: 'var(--brand)' }}>
            Importar outro arquivo
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ background: '#FEF2F2', color: '#991B1B' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}
