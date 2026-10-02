import { useState, useRef, useCallback } from 'react'
import { Upload, CheckCircle, AlertCircle, X, RefreshCw, Sparkles, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { useTransactions, useCategories, useImportBatches, useAccounts, useHouseholdPeople, findExistingExternalIds } from '@/hooks/useData'
import { showToast } from '@/components/Toast'
import { ManualTransactionCard } from '@/components/ManualTransactionCard'
import { formatBRL, formatDate, supabase } from '@/lib/supabase'
import { Link } from '@tanstack/react-router'
import { detectTransfers, type TransferKind, type DetectTx, PAIR_MAX_DAYS } from '@/lib/transferDetection'
import { parseOfxBytes, ofxToRows, accountFinalMatches, type OfxStatement } from '@/lib/ofxParser'
import { maskForCategorization, buildHistoryIndex, lookupHistory, chunk, flagDuplicates, looksInverted } from '@/lib/ofxImport'

type Step = 1 | 2 | 3 | 4

interface ImportItem {
  id: string
  descricao: string
  data: string
  valor: number
  tipo: 'despesa' | 'receita'
  categoriaId: string | null
  categoriaNome: string | null
  categoriaNomeOriginal: string | null  // categoria original sugerida
  categoriaIdOriginal: string | null
  confianca: 'alta' | 'media' | 'revisar'
  justificativa: string
  selected: boolean
  corrected: boolean  // usuário alterou a categoria
  // Transferências (motor de detecção)
  transferKind: TransferKind | null      // aplicado agora; null = lançamento comum
  suggestedKind: TransferKind | null     // sugestão do motor
  detStatus: 'auto' | 'ambigua' | 'nenhuma'
  motivo: string
  resolved: boolean                      // ambíguo já decidido pelo usuário
  pairId?: string                        // par com lançamento já gravado (regra 3)
  pairedExistingId?: string
  pairedLabel?: string
  externalId?: string | null             // FITID do OFX
  duplicate?: boolean                    // já importado (mesmo FITID na conta)
}

const DET_NONE = {
  transferKind: null, suggestedKind: null, detStatus: 'nenhuma' as const, motivo: '', resolved: true,
}

const KIND_LABEL: Record<TransferKind, string> = {
  entre_contas: 'Entre contas',
  pagamento_fatura: 'Pagamento de fatura',
  household: 'Entre membros do household',
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
  const [processingIssue, setProcessingIssue] = useState(false)
  const [pdfBase64,  setPdfBase64]  = useState<string | null>(null)
  const [showJust,   setShowJust]   = useState<string | null>(null)
  const [accountChoice, setAccountChoice] = useState<string>('') // '' = não escolheu, 'none' = sem conta
  const [format,     setFormat]     = useState<'pdf' | 'ofx'>('pdf')
  const [ofxKind,    setOfxKind]    = useState<OfxStatement['kind'] | null>(null)
  const [ofxNotice,  setOfxNotice]  = useState<string | null>(null)
  const [signFlipped, setSignFlipped] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { accounts }                    = useAccounts()
  const { people, loading: peopleLoading } = useHouseholdPeople()
  const activeAccounts = accounts.filter(a => a.ativo)
  const accountId = accountChoice && accountChoice !== 'none' ? accountChoice : null
  const needsAccountChoice = activeAccounts.length > 0 && accountChoice === ''
  const { bulkInsert }                  = useTransactions()
  const { categories }                  = useCategories()
  const { batches, addBatch, undoBatch } = useImportBatches()
  const [undoing, setUndoing]   = useState<string | null>(null)
  const [confirmUndo, setConfirmUndo] = useState<string | null>(null)
  // Lançamentos já gravados em OUTRAS contas do household, candidatos a par (regra 3)
  const pairPool = useRef<Map<string, { tx: DetectTx; label: string }>>(new Map())

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
    const supaAnon = import.meta.env.VITE_SUPABASE_ANON_KEY
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token ?? supaAnon
    const resp = await fetch(`${supaUrl}/functions/v1/parse-pdf`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
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

  // ── Registra o erro técnico pro admin ver (nunca mostra o erro cru pro cliente)
  const logSystemError = async (source: string, message: string, detail?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('system_errors').insert({
        source,
        message,
        detail:     detail ?? null,
        user_email: user?.email ?? null,
      })
    } catch {
      // Se até o log falhar, não trava a experiência do cliente
    }
  }

  // ── Busca candidatos a par: lançamentos comuns de outras contas, até 2 dias da janela do arquivo
  const loadPairPool = async (list: { data: string }[], acc: string | null) => {
    pairPool.current = new Map()
    if (!acc || list.length === 0) return
    const others = accounts.filter(a => a.id !== acc)
    if (others.length === 0) return
    try {
      const shift = (iso: string, days: number) => {
        const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days)
        return d.toISOString().slice(0, 10)
      }
      const datas = list.map(i => i.data).sort()
      const { data, error: err } = await supabase
        .from('transactions')
        .select('id, data, descricao, valor, tipo, account_id')
        .in('account_id', others.map(a => a.id))
        .in('tipo', ['despesa', 'receita'])
        .gte('data', shift(datas[0], -PAIR_MAX_DAYS))
        .lte('data', shift(datas[datas.length - 1], PAIR_MAX_DAYS))
      if (err) throw err
      for (const r of data ?? []) {
        const acct = accounts.find(a => a.id === r.account_id)
        pairPool.current.set(r.id, {
          tx: { id: r.id, data: r.data, descricao: r.descricao, valor: Number(r.valor), tipo: r.tipo, accountId: r.account_id },
          label: `${r.descricao} · ${acct?.apelido ?? 'outra conta'} · ${formatDate(r.data)}`,
        })
      }
    } catch (err: any) {
      // Sem candidatos o import segue; só não há pareamento com o que já está gravado
      logSystemError('import:pair-pool', err?.message ?? 'Erro desconhecido')
      pairPool.current = new Map()
    }
  }

  // ── Roda o motor de detecção e preenche os campos de transferência
  const applyDetection = (list: ImportItem[], acc: string | null): ImportItem[] => {
    if (!acc) return list.map(i => ({ ...i, ...DET_NONE }))
    const out = detectTransfers(
      list.map(i => ({ id: i.id, data: i.data, descricao: i.descricao, valor: i.valor, tipo: i.tipo, accountId: acc })),
      {
        accounts: accounts.map(a => ({
          id: a.id, instituicao: a.instituicao, apelido: a.apelido, tipo: a.tipo, ownerUserId: a.owner_user_id,
        })),
        people,
        existing: [...pairPool.current.values()].map(p => p.tx),
      },
    )
    return list.map((i, idx) => {
      const d = out[idx]
      return {
        ...i,
        suggestedKind: d.kind,
        detStatus: d.status,
        motivo: d.motivo,
        transferKind: d.status === 'auto' ? d.kind : null,
        resolved: d.status !== 'ambigua',
        // Só pareia quando o motor tem certeza (pairId) e o par é um lançamento já gravado
        pairId: d.pairId && pairPool.current.has(d.pairedWith ?? '') ? d.pairId : undefined,
        pairedExistingId: d.pairId && pairPool.current.has(d.pairedWith ?? '') ? d.pairedWith : undefined,
        pairedLabel: d.pairedWith ? pairPool.current.get(d.pairedWith)?.label : undefined,
      }
    })
  }

  // ── Categorização só por texto (Edge Function categorize-text)
  const categorizeTexts = async (rows: { descricao: string; tipo: 'despesa' | 'receita' }[]) => {
    const supaUrl = import.meta.env.VITE_SUPABASE_URL
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY
    const keyOf = (d: string, t: string) => `${t}|${d}`
    const unique = new Map<string, { d: string; t: 'd' | 'r' }>()
    for (const r of rows) {
      const d = maskForCategorization(r.descricao)
      unique.set(keyOf(d, r.tipo), { d, t: r.tipo === 'receita' ? 'r' : 'd' })
    }
    const result = new Map<string, { categoria_id: string | null; categoria_nome: string | null; confianca: ImportItem['confianca'] }>()
    let firstError: string | null = null
    for (const part of chunk([...unique.entries()], 150)) {
     try {
      const resp = await fetch(`${supaUrl}/functions/v1/categorize-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ itens: part.map(([, v]) => v) }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Erro desconhecido' }))
        throw new Error(err.error ?? `HTTP ${resp.status}`)
      }
      const data = await resp.json()
      part.forEach(([k], i) => result.set(k, data.itens[i]))
     } catch (err: any) {
      // Um bloco que falha não derruba os outros
      firstError = firstError ?? (err?.message ?? 'Erro desconhecido')
     }
    }
    const lookup = (descricao: string, tipo: string) => result.get(keyOf(maskForCategorization(descricao), tipo))
    return { lookup, error: firstError }
  }

  // Memória de categorias: o que o cliente já categorizou antes (mesmo estabelecimento)
  const loadHistoryIndex = async () => {
    try {
      const { data, error: err } = await supabase
        .from('transactions')
        .select('descricao, tipo, categoria_id')
        .not('categoria_id', 'is', null)
        .in('tipo', ['despesa', 'receita'])
        .order('data', { ascending: false })
        .limit(3000)
      if (err) throw err
      return buildHistoryIndex(data ?? [])
    } catch (err: any) {
      logSystemError('import:history', err?.message ?? 'Erro desconhecido')
      return new Map<string, string>()
    }
  }

  // ── Importação de OFX (sem IA de leitura: o arquivo já é estruturado)
  const handleOfx = async (file: File) => {
    if (!accountId) {
      setError(activeAccounts.length === 0
        ? 'Para importar um OFX, cadastre antes a conta em Contas e cartões.'
        : 'Para importar um OFX, escolha acima a conta a que o arquivo pertence.')
      return
    }
    const account = accounts.find(a => a.id === accountId)
    setLoading(true); setError(null); setProcessingIssue(false); setOfxNotice(null); setSignFlipped(false)
    setFormat('ofx'); setPdfBase64(null); setStep(2)
    try {
      const parsed = parseOfxBytes(await file.arrayBuffer())
      let statement = parsed.statements[0]
      if (parsed.statements.length > 1) {
        const match = parsed.statements.find(s => accountFinalMatches(account?.final, s.acctId))
        if (!match) throw new Error('Este OFX tem mais de um extrato e nenhum corresponde ao final da conta escolhida. Exporte um extrato por arquivo.')
        statement = match
      }
      const rows = ofxToRows(statement)

      // O arquivo é da conta escolhida? (mostra só o final, nunca o número completo)
      if (account?.final && statement.acctId && !accountFinalMatches(account.final, statement.acctId)) {
        setOfxNotice(`O número da conta no arquivo (final ${statement.acctId.replace(/\D/g, '').slice(-4)}) não bate com o final cadastrado (${account.final}). Confira se escolheu a conta certa.`)
      } else if (parsed.warnings.length > 0) {
        setOfxNotice(parsed.warnings[0])
      }
      setOfxKind(statement.kind)

      // Deduplicação por FITID
      const existing = await findExistingExternalIds(accountId, rows.map(r => r.externalId).filter((x): x is string => !!x))
      const flagged = flagDuplicates(rows, existing)

      // Categorização: 1) memória do que o cliente já categorou; 2) IA só por texto
      // para o resto. Se a IA falhar, segue sem categoria (o usuário escolhe).
      const history = await loadHistoryIndex()
      const novas = flagged.filter(f => !f.duplicate).map(f => f.row)
      const fromHistory = (descricao: string, tipo: string) => {
        const id = lookupHistory(history, descricao, tipo)
        const cat = id ? categories.find(c => c.id === id) : undefined
        return cat ? { categoria_id: cat.id, categoria_nome: cat.nome, confianca: 'alta' as const } : null
      }
      const needAI = novas.filter(r => !fromHistory(r.descricao, r.tipo))
      let ai: Awaited<ReturnType<typeof categorizeTexts>> | null = null
      if (needAI.length > 0) {
        try {
          ai = await categorizeTexts(needAI)
          if (ai.error) throw new Error(ai.error)
        } catch (err: any) {
          logSystemError('categorize-text', err.message ?? 'Erro desconhecido', file.name)
          showToast(`Não foi possível categorizar parte dos lançamentos automaticamente (${String(err.message ?? '').slice(0, 120)}). Escolha as categorias que faltam.`, 'error')
        }
      }
      const lookup = (descricao: string, tipo: string) => fromHistory(descricao, tipo) ?? ai?.lookup(descricao, tipo) ?? null

      const built: ImportItem[] = flagged.map(({ row, duplicate, externalId }) => {
        const cat = lookup(row.descricao, row.tipo)
        return {
          id: crypto.randomUUID(),
          descricao: row.descricao,
          data: row.data,
          valor: row.valor,
          tipo: row.tipo,
          categoriaId: cat?.categoria_id ?? null,
          categoriaNome: cat?.categoria_nome ?? null,
          categoriaIdOriginal: cat?.categoria_id ?? null,
          categoriaNomeOriginal: cat?.categoria_nome ?? null,
          confianca: cat?.confianca ?? 'revisar',
          justificativa: '',
          selected: !duplicate,
          corrected: false,
          externalId,
          duplicate,
          ...DET_NONE,
        }
      })
      // Detecção só sobre o que será importado; duplicados ficam como estão.
      await loadPairPool(built.filter(b => !b.duplicate), accountId)
      const fresh = applyDetection(built.filter(b => !b.duplicate), accountId)
      const byId = new Map(fresh.map(f => [f.id, f]))
      setItems(built.map(b => byId.get(b.id) ?? b))

      const datas = rows.map(r => r.data).sort()
      setResult({
        fonte: `OFX · ${account?.apelido ?? account?.instituicao ?? 'conta'}`,
        periodo: statement.inicio && statement.fim
          ? { inicio: statement.inicio, fim: statement.fim }
          : datas.length ? { inicio: datas[0], fim: datas[datas.length - 1] } : null,
        total_despesas: rows.filter(r => r.tipo === 'despesa').reduce((s, r) => s + r.valor, 0),
        total_receitas: rows.filter(r => r.tipo === 'receita').reduce((s, r) => s + r.valor, 0),
      })
      setStep(3)
    } catch (err: any) {
      setError(err?.message ?? 'Não foi possível ler o arquivo OFX.')
      logSystemError('ofx:upload', err?.message ?? 'Erro desconhecido', file.name)
      setStep(1)
    } finally {
      setLoading(false)
    }
  }

  // Cartão com sinais invertidos: troca despesa/receita e reaplica o motor.
  const flipSigns = () => {
    setSignFlipped(f => !f)
    const flipped = items.map(i => ({ ...i, tipo: i.tipo === 'despesa' ? 'receita' as const : 'despesa' as const }))
    const fresh = applyDetection(flipped.filter(i => !i.duplicate), accountId)
    const byId = new Map(fresh.map(f => [f.id, f]))
    setItems(flipped.map(i => byId.get(i.id) ?? i))
  }

  // ── Upload e extração inicial (PDF)
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (/\.ofx$/i.test(file.name)) { await handleOfx(file); e.target.value = ''; return }
    if (file.type !== 'application/pdf') {
      setError('Envie um arquivo PDF ou OFX.')
      return
    }
    setFormat('pdf')
    setLoading(true)
    setError(null)
    setProcessingIssue(false)
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
        ...DET_NONE,
      }))

      await loadPairPool(parsed, accountId)
      setItems(applyDetection(parsed, accountId))
      setResult({
        fonte:          data.fonte,
        periodo:        data.periodo,
        total_despesas: data.total_despesas,
        total_receitas: data.total_receitas,
      })
      setStep(3)
    } catch (err: any) {
      logSystemError('parse-pdf:upload', err.message ?? 'Erro desconhecido', file?.name)
      setProcessingIssue(true)
      setStep(1)
    } finally {
      setLoading(false)
    }
  }

  // ── Revalidar categorização usando as correções do usuário
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
          ...(existing
            ? { transferKind: existing.transferKind, suggestedKind: existing.suggestedKind, detStatus: existing.detStatus, motivo: existing.motivo, resolved: existing.resolved }
            : DET_NONE),
        }
      })
      setItems(updated)
    } catch (err: any) {
      logSystemError('parse-pdf:revalidate', err.message ?? 'Erro desconhecido')
      showToast('Não foi possível recategorizar agora. Nossa equipe já foi avisada.', 'error')
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
  const allCategorized  = selectedItems.every(i => i.transferKind || i.categoriaId)
  const pendingAmbiguous = selectedItems.filter(i => !i.resolved).length
  const transferCount    = selectedItems.filter(i => i.transferKind).length
  const transferTotal    = selectedItems.filter(i => i.transferKind).reduce((s, i) => s + i.valor, 0)
  const patchItem = (id: string, patch: Partial<ImportItem>) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  const corrections     = items.filter(i => i.corrected && i.categoriaIdOriginal !== i.categoriaId)
  const totalSelected   = selectedItems.reduce((s, i) => s + i.valor, 0)
  const needsReview     = items.filter(i => i.confianca === 'revisar' && !i.corrected).length

  const confirm = async () => {
    if (!allCategorized || pendingAmbiguous > 0) return
    setLoading(true)
    // Pares com lançamentos já gravados: a outra ponta vira transferência junto.
    const links = selectedItems
      .filter(i => i.transferKind && i.pairId && i.pairedExistingId)
      .map(i => ({ existingId: i.pairedExistingId!, kind: i.transferKind!, pairId: i.pairId! }))
    const linkedPairIds: string[] = []
    let batchId: string | null = null
    const rollback = async () => {
      try {
        if (batchId) await supabase.rpc('undo_import_batch', { p_batch_id: batchId, p_force_empty: true })
        if (linkedPairIds.length > 0) await supabase.rpc('unlink_transfer_pairs', { p_pair_ids: linkedPairIds })
      } catch (e: any) {
        logSystemError('import:rollback', e?.message ?? 'Erro desconhecido', `pairs=${linkedPairIds.length}`)
      }
    }
    try {
      // 1) vincula as pontas já gravadas (se falhar, nada foi criado ainda)
      for (const l of links) {
        const { error: err } = await supabase.rpc('link_transfer_pair', { p_tx_id: l.existingId, p_kind: l.kind, p_pair_id: l.pairId })
        if (err) throw err
        linkedPairIds.push(l.pairId)
      }
      // 2) o lote vem antes dos lançamentos: eles referenciam import_batch_id
      batchId = await addBatch({
        fonte:          result?.fonte ?? null,
        periodo_inicio: result?.periodo?.inicio ?? null,
        periodo_fim:    result?.periodo?.fim ?? null,
        quantidade:     selectedItems.length,
        valor_total:    totalSelected,
        account_id:     accountId,
        formato:        format,
      })
      // 3) lançamentos
      await bulkInsert(selectedItems.map(i => ({
        data:        i.data,
        descricao:   i.descricao,
        categoria_id: i.transferKind ? null : i.categoriaId,
        tipo:        i.transferKind ? 'transferencia' as const : i.tipo,
        transfer_kind: i.transferKind,
        transfer_pair_id: i.transferKind && i.pairedExistingId ? i.pairId ?? null : null,
        // Só enviado em transferências: lançamentos comuns seguem funcionando sem a migração D9
        ...(i.transferKind ? { transfer_direction: i.tipo === 'despesa' ? 'saida' as const : 'entrada' as const } : {}),
        valor:       i.valor,
        origem:      format === 'ofx' ? 'ofx' as const : 'pdf' as const,
        external_id: i.externalId ?? null,
        status:      'confirmada' as const,
        confianca:   i.confianca,
        account_id:  accountId,
        import_batch_id: batchId,
      })))
      setStep(4)
      showToast(`${selectedItems.length} lançamento${selectedItems.length !== 1 ? 's' : ''} cadastrado${selectedItems.length !== 1 ? 's' : ''} com sucesso!`)
    } catch (err: any) {
      await rollback()
      logSystemError('import:confirm', err.message ?? 'Erro desconhecido')
      showToast('Erro ao cadastrar os lançamentos. Nada foi salvo. Nossa equipe já foi avisada.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleUndo = async (id: string) => {
    setUndoing(id)
    try {
      const r = await undoBatch(id)
      showToast(`Importação desfeita: ${r.deleted} lançamento${r.deleted !== 1 ? 's' : ''} removido${r.deleted !== 1 ? 's' : ''}${r.restored > 0 ? ` e ${r.restored} restaurado${r.restored !== 1 ? 's' : ''}` : ''}.`)
    } catch (err: any) {
      logSystemError('import:undo', err?.message ?? 'Erro desconhecido', id)
      showToast(/anterior ao controle/.test(err?.message ?? '')
        ? 'Esta importação é antiga e não pode ser desfeita automaticamente.'
        : 'Não foi possível desfazer a importação.', 'error')
    } finally {
      setUndoing(null); setConfirmUndo(null)
    }
  }

  const reset = () => { setStep(1); setItems([]); setResult(null); setError(null); setProcessingIssue(false); setPdfBase64(null); setAccountChoice(''); setFormat('pdf'); setOfxKind(null); setOfxNotice(null); setSignFlipped(false) }

  const STEPS = ['Upload', 'Extraindo', 'Revisão', 'Concluído']

  return (
    <div className="p-4 md:p-8 max-w-screen-xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>
          Importar despesas
        </h1>
        <p className="text-sm mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} />
          Categorização automática · revisão e correção incluídas
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
        <div className="rounded-2xl border bg-white p-5 space-y-2" style={{ borderColor: 'var(--border)' }}>
          <label className="text-sm font-medium block" style={{ color: 'var(--ink)' }}>
            De qual conta é este arquivo?
          </label>
          {activeAccounts.length === 0
            ? <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Você ainda não cadastrou contas. <Link to="/contas" className="underline" style={{ color: 'var(--brand)' }}>Cadastre suas contas e cartões</Link>{' '}
                para identificarmos transferências automaticamente.
              </p>
            : <>
                <select value={accountChoice} onChange={e => setAccountChoice(e.target.value)}
                  className="w-full md:max-w-sm border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                  <option value="">Selecione...</option>
                  {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.apelido} · {a.instituicao}</option>)}
                  <option value="none">Não informar (sem detecção de transferências)</option>
                </select>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Usamos a conta para separar transferências (entre contas, pagamento de fatura) de despesas reais.
                </p>
              </>}
        </div>
      )}

      {step === 1 && (
        <div
          onClick={() => { if (!needsAccountChoice && !peopleLoading) fileRef.current?.click() }}
          className={`rounded-2xl border-2 border-dashed p-14 text-center transition-colors ${needsAccountChoice || peopleLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-brand'}`}
          style={{ borderColor: 'var(--border)' }}
          onDragOver={e => { e.preventDefault() }}
          onDrop={e => { e.preventDefault(); if (needsAccountChoice || peopleLoading) return; const file = e.dataTransfer.files[0]; if (file) { const dt = new DataTransfer(); dt.items.add(file); if (fileRef.current) { fileRef.current.files = dt.files; handleFile({ target: fileRef.current } as any) } } }}>
          <Upload className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--muted)' }} />
          <p className="font-medium text-lg mb-1" style={{ color: 'var(--ink)' }}>
            Arraste ou clique para enviar
          </p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {needsAccountChoice ? 'Escolha a conta acima para enviar' : 'Fatura ou extrato em PDF ou OFX'}
          </p>
          <div className="flex items-center justify-center gap-2 mt-4 text-xs" style={{ color: 'var(--muted)' }}>
            <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} />
            PDF (lido e categorizado pela IA) ou OFX (extrato estruturado do banco)
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.ofx" className="hidden" onChange={handleFile} />
        </div>
      )}

      {/* Lançamento manual */}
      {step === 1 && <ManualTransactionCard />}

      {/* Histórico de importações */}
      {step === 1 && batches.length > 0 && (
        <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Já importado</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', background: '#FAFAF8' }}>
                  <th className="px-5 py-2.5 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>ARQUIVO</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>PERÍODO</th>
                  <th className="px-5 py-2.5 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>IMPORTADO EM</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>ITENS</th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>VALOR TOTAL</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--ink)' }}>{b.fonte ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--muted)' }}>
                      {b.periodo_inicio && b.periodo_fim ? `${formatDate(b.periodo_inicio)} – ${formatDate(b.periodo_fim)}` : '—'}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs" style={{ color: 'var(--muted)' }}>{formatDate(b.created_at.slice(0, 10))}</td>
                    <td className="px-5 py-3 text-right font-mono" style={{ color: 'var(--ink)' }}>{b.quantidade}</td>
                    <td className="px-5 py-3 text-right font-mono font-medium" style={{ color: 'var(--ink)' }}>{formatBRL(b.valor_total)}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {confirmUndo === b.id
                        ? <span className="text-xs">
                            Apagar os {b.quantidade} lançamentos?{' '}
                            <button onClick={() => handleUndo(b.id)} disabled={undoing === b.id}
                              className="underline font-medium text-red-600 disabled:opacity-50">
                              {undoing === b.id ? 'Desfazendo...' : 'Sim, desfazer'}
                            </button>{' '}
                            <button onClick={() => setConfirmUndo(null)} className="underline" style={{ color: 'var(--muted)' }}>Não</button>
                          </span>
                        : <button onClick={() => setConfirmUndo(b.id)} className="text-xs underline" style={{ color: 'var(--muted)' }}>
                            Desfazer
                          </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <p className="font-medium text-lg" style={{ color: 'var(--ink)' }}>Lendo seu PDF</p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Extraindo transações e categorizando automaticamente...
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

          {/* OFX: avisos, duplicados e sinais do cartão */}
          {format === 'ofx' && ofxNotice && (
            <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2" style={{ background: '#FFFBEB', color: '#78350F' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {ofxNotice}
            </div>
          )}
          {format === 'ofx' && items.some(i => i.duplicate) && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#EFF6FF', color: '#1E3A8A' }}>
              {items.filter(i => i.duplicate).length} lançamento{items.filter(i => i.duplicate).length !== 1 ? 's' : ''} já importado{items.filter(i => i.duplicate).length !== 1 ? 's' : ''} antes (mesmo código do banco) e desmarcado{items.filter(i => i.duplicate).length !== 1 ? 's' : ''}.
            </div>
          )}
          {format === 'ofx' && ofxKind === 'cartao' && (signFlipped || looksInverted('cartao', items.map(i => i.tipo))) && (
            <div className="rounded-xl border px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: '#FCD34D', background: '#FFFBEB' }}>
              <p className="text-sm" style={{ color: '#78350F' }}>
                {signFlipped
                  ? 'Sinais invertidos: compras agora aparecem como despesa.'
                  : 'A maioria dos lançamentos do cartão aparece como receita. Alguns emissores enviam compras com sinal positivo.'}
              </p>
              <button onClick={flipSigns} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--brand)' }}>
                {signFlipped ? 'Desfazer inversão' : 'Inverter sinais'}
              </button>
            </div>
          )}

          {/* Revalidate banner */}
          {format === 'pdf' && corrections.length > 0 && (
            <div className="rounded-xl border px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
              style={{ background: '#F0FDF4', borderColor: '#86EFAC' }}>
              <p className="text-sm text-green-800">
                <strong>{corrections.length} correção{corrections.length > 1 ? 'ões' : ''}</strong> feita{corrections.length > 1 ? 's' : ''} por você.
                Quer recategorizar transações similares automaticamente?
              </p>
              <button onClick={revalidate} disabled={reloading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-60"
                style={{ background: 'var(--brand)' }}>
                <RefreshCw className={`w-3.5 h-3.5 ${reloading ? 'animate-spin' : ''}`} />
                {reloading ? 'Recategorizando...' : 'Revalidar categorização'}
              </button>
            </div>
          )}

          {items.length === 0 ? (
            <div className="rounded-2xl border bg-white p-12 text-center" style={{ borderColor: 'var(--border)' }}>
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-amber-500" />
              <p className="font-medium mb-2" style={{ color: 'var(--ink)' }}>Nenhuma transação encontrada</p>
              <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                Não foi possível extrair dados deste PDF. Verifique se é um extrato ou fatura válida.
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
                          checked={items.filter(i => !i.duplicate).every(i => i.selected)}
                          onChange={e => setItems(items.map(i => i.duplicate ? i : { ...i, selected: e.target.checked }))}
                        />
                      </th>
                      <th className="px-3 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>DESCRIÇÃO</th>
                      <th className="px-3 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>DATA</th>
                      <th className="px-3 py-3 text-left text-[11px] font-mono tracking-wider" style={{ color: 'var(--muted)' }}>CONFIANÇA</th>
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
                              <input type="checkbox" checked={item.selected} disabled={item.duplicate}
                                onChange={e => setItems(items.map(i => i.id === item.id ? { ...i, selected: e.target.checked } : i))} />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-medium" style={{ color: 'var(--ink)' }}>
                                {item.descricao}
                                {item.duplicate && (
                                  <span className="ml-2 px-1.5 py-px rounded text-[10px] font-medium" style={{ background: '#DBEAFE', color: '#1E40AF' }}>
                                    Já importado
                                  </span>
                                )}
                              </div>
                              {item.corrected && (
                                <div className="text-[10px] mt-0.5" style={{ color: 'var(--brand)' }}>
                                  ✓ corrigido por você
                                </div>
                              )}
                              {item.transferKind ? (
                                <div className="mt-1 text-[11px] space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="px-1.5 py-px rounded font-medium" style={{ background: '#E0E7FF', color: '#3730A3' }}>
                                      Transferência
                                    </span>
                                    <select value={item.transferKind} aria-label="Tipo de transferência"
                                      onChange={e => patchItem(item.id, { transferKind: e.target.value as TransferKind, resolved: true })}
                                      className="border rounded px-1 py-0.5 text-[11px]" style={{ borderColor: 'var(--border)' }}>
                                      {(Object.keys(KIND_LABEL) as TransferKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                                    </select>
                                    <button type="button" className="underline" style={{ color: 'var(--muted)' }}
                                      onClick={() => patchItem(item.id, { transferKind: null, resolved: true })}>
                                      Não é transferência
                                    </button>
                                  </div>
                                  {item.motivo && <div style={{ color: 'var(--muted)' }}>{item.motivo}</div>}
                                  {item.pairedExistingId && item.pairedLabel && (
                                    <div style={{ color: '#3730A3' }}>
                                      Par com lançamento já gravado: {item.pairedLabel}. Ele também passa a ser transferência.
                                    </div>
                                  )}
                                </div>
                              ) : !item.resolved && item.suggestedKind ? (
                                <div className="mt-1 text-[11px] rounded-lg px-2 py-1.5 space-y-1" style={{ background: '#FFFBEB', color: '#78350F' }}>
                                  <div><strong>Possível transferência ({KIND_LABEL[item.suggestedKind]}).</strong> {item.motivo}</div>
                                  <div className="flex gap-3">
                                    <button type="button" className="underline font-medium"
                                      onClick={() => patchItem(item.id, { transferKind: item.suggestedKind, resolved: true })}>
                                      É transferência
                                    </button>
                                    <button type="button" className="underline"
                                      onClick={() => patchItem(item.id, { transferKind: null, resolved: true })}>
                                      Não é
                                    </button>
                                  </div>
                                </div>
                              ) : accountId && (
                                <button type="button" className="mt-0.5 text-[10px] underline" style={{ color: 'var(--muted)' }}
                                  onClick={() => patchItem(item.id, { transferKind: item.suggestedKind ?? 'entre_contas', resolved: true })}>
                                  Marcar como transferência
                                </button>
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
                              {item.transferKind ? <span className="text-xs" style={{ color: 'var(--muted)' }}>—</span> : <select
                                value={item.categoriaId ?? ''}
                                className={`border rounded-lg px-2 py-1 text-xs outline-none max-w-[180px] ${!item.categoriaId ? 'border-amber-400 bg-amber-50' : ''}`}
                                style={{ borderColor: item.categoriaId ? 'var(--border)' : '#F59E0B' }}
                                onChange={e => setCategory(item.id, e.target.value)}>
                                <option value="">Selecione...</option>
                                {categories.map(c => (
                                  <option key={c.id} value={c.id}>{c.nome}</option>
                                ))}
                              </select>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-medium"
                              style={{ color: item.transferKind ? '#4338CA' : item.tipo === 'despesa' ? '#DC2626' : '#16A34A' }}>
                              {item.transferKind ? '' : item.tipo === 'despesa' ? '-' : '+'}{formatBRL(item.valor)}
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
                                💡 <strong>Justificativa:</strong> {item.justificativa}
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
                {pendingAmbiguous > 0
                  ? <p className="text-xs font-medium" style={{ color: '#D97706' }}>
                      Decida os {pendingAmbiguous} lançamento{pendingAmbiguous !== 1 ? 's' : ''} com possível transferência antes de confirmar
                    </p>
                  : !allCategorized && (
                  <p className="text-xs font-medium" style={{ color: '#D97706' }}>
                    Selecione a categoria de todos os itens antes de confirmar
                  </p>
                )}
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={reset} className="px-4 py-2 rounded-xl text-sm border"
                    style={{ borderColor: 'var(--border)' }}>Cancelar</button>
                  <button onClick={confirm} disabled={!allCategorized || pendingAmbiguous > 0 || loading || selectedItems.length === 0}
                    className="px-5 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--brand)' }}>
                    {loading ? 'Salvando...' : `Confirmar ${selectedItems.length} lançamento${selectedItems.length !== 1 ? 's' : ''}`}
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
            {selectedItems.length} lançamento{selectedItems.length !== 1 ? 's' : ''} importado{selectedItems.length !== 1 ? 's' : ''}!
          </p>
          <p className="text-sm mb-2" style={{ color: 'var(--muted)' }}>
            Total de {formatBRL(totalSelected - transferTotal)} adicionado ao seu mês
            {transferCount > 0 && `, fora ${transferCount} transferência${transferCount !== 1 ? 's' : ''} (${formatBRL(transferTotal)}) que não entram no cálculo de despesas`}.
          </p>
          {corrections.length > 0 && (
            <p className="text-sm mb-6" style={{ color: 'var(--brand)' }}>
              ✓ {corrections.length} correção{corrections.length > 1 ? 'ões' : ''} registrada{corrections.length > 1 ? 's' : ''} — isso vai melhorar as próximas importações.
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

      {processingIssue && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
          style={{ background: '#F5F0E8', color: 'var(--ink)' }}>
          <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted)' }} />
          Em processamento — pode levar alguns minutos. Se demorar demais, avisamos nossa equipe automaticamente.
        </div>
      )}
    </div>
  )
}
