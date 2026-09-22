
import { useState } from 'react'
import { ArrowRight, Plus, Trash2, RotateCcw } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth'
import { formatBRL } from '@/lib/supabase'
import { useDiagnostico } from '@/hooks/useData'

// ─── Tipos ─────────────────────────────────────────────────────────────
type FieldType =
  | 'text' | 'textarea' | 'number' | 'currency'
  | 'boolean' | 'radio' | 'checkbox' | 'dependents' | 'consent'

interface FieldOption { value: string; desc?: string | null }

interface FieldDef {
  key: string
  label?: string
  type: FieldType
  placeholder?: string
  unit?: string
  required?: boolean
  options?: (string | FieldOption)[]
  showIf?: { key: string; equals: any }
}

interface QuestionStep {
  type: 'question'
  id: string
  sectionId: string
  title: string
  subtitle?: string
  fields: FieldDef[]
}

interface SectionDividerStep {
  type: 'section'
  id: string
  section: { id: string; num: number; title: string; subtitle: string }
}

type Step = { type: 'welcome'; id: string } | SectionDividerStep | QuestionStep | { type: 'summary'; id: string }

const normalizeOptions = (opts: (string | FieldOption)[] = []): FieldOption[] =>
  opts.map(o => (typeof o === 'string' ? { value: o, desc: null } : o))

// ─── Estrutura do diagnóstico ────────────────────────────────────────────────
const SECTIONS = [
  { id: 'pessoal', num: 1, title: 'Vamos começar com você', subtitle: 'Informações pessoais e familiares que dão contexto para tudo o que vem depois.' },
  { id: 'renda', num: 2, title: 'Sua atividade e sua renda', subtitle: 'Entender de onde vem o dinheiro é o primeiro passo do diagnóstico.' },
  { id: 'despesas', num: 3, title: 'Suas despesas mensais', subtitle: 'Vamos mapear para onde o dinheiro vai — fixas, variáveis e anuais.' },
  { id: 'patrimonio', num: 4, title: 'Seu patrimônio hoje', subtitle: 'O que você já construiu, e o que ainda compromete sua renda.' },
  { id: 'perfil', num: 5, title: 'Seus investimentos', subtitle: 'O que você já tem aplicado hoje.' },
  { id: 'objetivos', num: 6, title: 'Seus objetivos financeiros', subtitle: 'O que você quer alcançar — e em que prazo.' },
  { id: 'seguros', num: 7, title: 'Proteção: seguros', subtitle: 'O que aconteceria com sua família se algo saísse do previsto.' },
  { id: 'estruturacao', num: 8, title: 'Estruturação e sucessão', subtitle: 'Como seu patrimônio se organiza — hoje e para o futuro.' },
]

const QUESTIONS_BY_SECTION: Record<string, { id: string; title: string; subtitle?: string; fields: FieldDef[] }[]> = {
  pessoal: [
    { id: 'p1', title: 'Como você se chama?', fields: [
      { key: 'nomeCompleto', label: 'Nome completo', type: 'text', placeholder: 'Seu nome completo', required: true },
    ] },
    { id: 'p2', title: 'Mais alguns dados de identificação', fields: [
      { key: 'cpf', label: 'CPF', type: 'text', placeholder: '000.000.000-00' },
      { key: 'dataNascimento', label: 'Data de nascimento', type: 'text', placeholder: 'DD/MM/AAAA' },
    ] },
    { id: 'p3', title: 'Qual o seu estado civil?', fields: [
      { key: 'estadoCivil', type: 'radio', options: ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'] },
    ] },
    { id: 'p4', title: 'E o regime de bens?', subtitle: 'Se não se aplica, pode pular.', fields: [
      { key: 'regimeBens', type: 'radio', options: ['Comunhão parcial de bens', 'Comunhão total de bens', 'Separação total de bens', 'Não sei / não se aplica'] },
    ] },
    { id: 'p5', title: 'Você tem dependentes financeiros?', subtitle: 'Filhos, pais ou qualquer pessoa que dependa da sua renda.', fields: [
      { key: 'dependentes', type: 'dependents' },
    ] },
    { id: 'p6', title: 'Mais duas coisas sobre você', fields: [
      { key: 'idadeAposentadoria', label: 'Com que idade quer se aposentar?', type: 'number', unit: 'anos' },
      { key: 'planoSaude', label: 'Você tem plano de saúde?', type: 'boolean' },
    ] },
  ],
  renda: [
    { id: 'r1', title: 'Como é o seu vínculo profissional?', fields: [
      { key: 'vinculo', type: 'radio', options: ['CLT', 'PJ / Autônomo', 'Empresário(a)', 'Aposentado(a)'] },
    ] },
    { id: 'r2', title: 'Qual a sua renda mensal?', subtitle: 'Valores líquidos, aproximados.', fields: [
      { key: 'rendaFixa', label: 'Renda fixa (salário / pró-labore)', type: 'currency' },
      { key: 'rendaVariavel', label: 'Renda variável (comissões, bônus, PLR)', type: 'currency' },
      { key: 'outrasRendas', label: 'Outras rendas (aluguéis, dividendos, pensão)', type: 'currency' },
    ] },
    { id: 'r3', title: 'Sua renda costuma ser…', fields: [
      { key: 'estabilidadeRenda', type: 'radio', options: ['Estável todo mês', 'Sazonal (varia por época do ano)', 'Bastante variável'] },
    ] },
  ],
  despesas: [
    { id: 'd1', title: 'Suas despesas fixas mensais', fields: [
      { key: 'moradia', label: 'Moradia (aluguel/financiamento + condomínio)', type: 'currency' },
      { key: 'educacao', label: 'Educação', type: 'currency' },
      { key: 'saudeDespesa', label: 'Saúde (plano + medicamentos)', type: 'currency' },
      { key: 'transporte', label: 'Transporte', type: 'currency' },
      { key: 'assinaturas', label: 'Assinaturas e mensalidades', type: 'currency' },
    ] },
    { id: 'd2', title: 'Suas despesas variáveis', fields: [
      { key: 'alimentacao', label: 'Alimentação', type: 'currency' },
      { key: 'lazer', label: 'Lazer', type: 'currency' },
      { key: 'vestuario', label: 'Vestuário', type: 'currency' },
      { key: 'viagens', label: 'Viagens', type: 'currency' },
    ] },
    { id: 'd3', title: 'E as despesas sazonais ou anuais?', subtitle: 'Pode informar o valor médio anual.', fields: [
      { key: 'ipvaIptu', label: 'IPVA / IPTU', type: 'currency' },
      { key: 'segurosAnuais', label: 'Seguros com vencimento anual', type: 'currency' },
      { key: 'impostoRenda', label: 'Imposto de Renda (pagar ou restituir)', type: 'currency' },
    ] },
  ],
  patrimonio: [
    { id: 'pa1', title: 'O que você já construiu?', subtitle: 'Valor estimado de mercado de cada item.', fields: [
      { key: 'imoveis', label: 'Imóveis', type: 'currency' },
      { key: 'veiculos', label: 'Veículos', type: 'currency' },
      { key: 'participacoes', label: 'Participações societárias / empresas', type: 'currency' },
      { key: 'saldoContas', label: 'Saldo em conta corrente e poupança', type: 'currency' },
    ] },
    { id: 'pa2', title: 'E o que ainda está comprometido?', subtitle: 'Suas dívidas e financiamentos em aberto.', fields: [
      { key: 'financiamentoImovel', label: 'Financiamento imobiliário (saldo devedor)', type: 'currency' },
      { key: 'financiamentoVeiculo', label: 'Financiamento de veículo', type: 'currency' },
      { key: 'emprestimos', label: 'Empréstimos pessoais / consignados', type: 'currency' },
      { key: 'cartaoCredito', label: 'Cartão de crédito (saldo devedor)', type: 'currency' },
      { key: 'consorciosAndamento', label: 'Consórcios em andamento', type: 'currency' },
      { key: 'dividasTerceiros', label: 'Dívidas com terceiros', type: 'currency' },
    ] },
    { id: 'pa3', title: 'Sobre sua reserva de emergência', fields: [
      { key: 'valorReserva', label: 'Valor total guardado hoje', type: 'currency' },
      { key: 'mesesCobertos', label: 'Quantos meses de despesas ela cobre', type: 'number', unit: 'meses' },
    ] },
  ],
  perfil: [
    { id: 'pf1', title: 'Você já tem investimentos financeiros?', fields: [
      { key: 'temInvestimentos', type: 'boolean' },
      { key: 'valorInvestimentos', label: 'Qual o valor total aplicado?', type: 'currency', showIf: { key: 'temInvestimentos', equals: true } },
    ] },
  ],
  objetivos: [
    { id: 'o1', title: 'O que você quer alcançar?', subtitle: 'Vamos separar por prazo.', fields: [
      { key: 'curtoPrazo', label: 'Curto prazo (até 1 ano)', type: 'textarea', placeholder: 'Ex: montar reserva de emergência, fazer uma viagem' },
      { key: 'medioPrazo', label: 'Médio prazo (1 a 5 anos)', type: 'textarea', placeholder: 'Ex: entrada de um imóvel, trocar de carro' },
      { key: 'longoPrazo', label: 'Longo prazo (5+ anos)', type: 'textarea', placeholder: 'Ex: aposentadoria, faculdade dos filhos' },
    ] },
    { id: 'o2', title: 'Qual desses é o mais urgente pra você agora?', fields: [
      { key: 'prioridade', type: 'radio', options: ['O de curto prazo', 'O de médio prazo', 'O de longo prazo'] },
    ] },
  ],
  seguros: [
    { id: 's1', title: 'Se algo acontecesse com você…', subtitle: 'Perguntas difíceis, mas essenciais para dimensionar sua proteção.', fields: [
      { key: 'dependentesFinanceiros', label: 'Quantas pessoas dependem da sua renda', type: 'number', unit: 'pessoas' },
      { key: 'rendaSubstituir', label: 'Quanto elas precisariam por mês', type: 'currency' },
      { key: 'dividasQuitar', label: 'Dívidas que precisariam ser quitadas', type: 'currency' },
    ] },
    { id: 's2', title: 'Você já tem seguro de vida?', fields: [
      { key: 'apoliceVida', type: 'boolean' },
      { key: 'valorApolice', label: 'Qual o capital segurado hoje?', type: 'currency', showIf: { key: 'apoliceVida', equals: true } },
    ] },
    { id: 's3', title: 'Sobre invalidez e doenças graves', fields: [
      { key: 'profissaoRisco', label: 'Grau de risco da sua profissão', type: 'radio', options: ['Baixo risco', 'Risco moderado', 'Alto risco'] },
      { key: 'historicoSaude', label: 'Alguma condição de saúde relevante (sua ou de familiar direto)?', type: 'textarea', placeholder: 'Opcional' },
    ] },
    { id: 's4', title: 'E o seu plano de saúde?', fields: [
      { key: 'planoSaudeAtual', label: 'Plano atual (operadora / categoria)', type: 'text' },
      { key: 'carencias', label: 'Alguma carência relevante em aberto?', type: 'text' },
    ] },
    { id: 's5', title: 'Quais seguros patrimoniais você já tem?', fields: [
      { key: 'segurosPatrimoniais', type: 'checkbox', options: ['Residencial', 'Automotivo', 'Empresarial', 'Nenhum ainda'] },
    ] },
  ],
  estruturacao: [
    { id: 'e1', title: 'E sobre consórcio?', fields: [
      { key: 'consorcio', type: 'radio', options: ['Já possuo uma ou mais cotas', 'Estou contemplado', 'Tenho interesse', 'Não tenho interesse'] },
    ] },
    { id: 'e2', title: 'Você tem previdência privada?', fields: [
      { key: 'previdencia', type: 'radio', options: ['PGBL', 'VGBL', 'Nenhuma / não sei'] },
    ] },
    { id: 'e3', title: 'Planejamento sucessório', fields: [
      { key: 'testamento', label: 'Você tem testamento?', type: 'boolean' },
      { key: 'holding', label: 'Já tem ou pensa em ter uma holding familiar?', type: 'boolean' },
      { key: 'doacoesPlanejadas', label: 'Alguma doação em vida planejada?', type: 'text', placeholder: 'Opcional' },
    ] },
    { id: 'e4', title: 'Por fim, sobre o seu Imposto de Renda', fields: [
      { key: 'declaracaoIR', type: 'radio', options: ['Declaração completa', 'Declaração simplificada', 'Não sei dizer'] },
    ] },
  ],
}

function buildSteps(): Step[] {
  const steps: Step[] = [{ type: 'welcome', id: 'welcome' }]
  SECTIONS.forEach(section => {
    steps.push({ type: 'section', id: 'section-' + section.id, section })
    QUESTIONS_BY_SECTION[section.id].forEach(q => {
      steps.push({ type: 'question', sectionId: section.id, ...q })
    })
  })
  steps.push({
    type: 'question',
    id: 'contato',
    sectionId: 'contato',
    title: 'Como podemos te chamar para conversar sobre isso?',
    fields: [
      { key: 'telefone', label: 'Telefone / WhatsApp', type: 'text', placeholder: '(11) 99999-9999', required: true },
      { key: 'email', label: 'E-mail', type: 'text', placeholder: 'voce@email.com' },
    ],
  })
  steps.push({
    type: 'question',
    id: 'termo',
    sectionId: 'termo',
    title: 'Antes de concluir',
    subtitle: 'Confirme para finalizar o seu diagnóstico.',
    fields: [
      {
        key: 'termoAceite',
        type: 'consent',
        required: true,
        label: 'Declaro que as informações preenchidas neste formulário são verdadeiras e completas, e me responsabilizo integralmente pela exatidão dos dados fornecidos.',
      },
    ],
  })
  steps.push({ type: 'summary', id: 'summary' })
  return steps
}

const STEPS = buildSteps()

function formatAnswerForDisplay(field: FieldDef, value: any): string | null {
  switch (field.type) {
    case 'currency':
      return value !== undefined && value !== '' ? formatBRL(value) : null
    case 'boolean':
      return value === undefined ? null : (value ? 'Sim' : 'Não')
    case 'checkbox':
      return Array.isArray(value) && value.length ? value.join(', ') : null
    case 'dependents':
      return Array.isArray(value) && value.length
        ? value.map((d: any) => `${d.nome || 'Sem nome'} (${d.idade || '?'} anos)`).join('; ')
        : null
    case 'number':
      return value !== undefined && value !== '' ? `${value}${field.unit ? ' ' + field.unit : ''}` : null
    default:
      return value ? String(value) : null
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────
export function DiagnosticoPage() {
  const { user } = useAuth()
  const { salvar, salvando, erro } = useDiagnostico()

  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [salvo, setSalvo] = useState(false)

  const current = STEPS[step]
  const isFirst = step === 0
  const progressPct = Math.round((step / (STEPS.length - 1)) * 100)

  const updateAnswer = (key: string, value: any) => setAnswers(prev => ({ ...prev, [key]: value }))

  // Quando a resposta de um campo muda, limpa quaisquer campos-filho (showIf)
  // cuja condição deixou de ser satisfeita — evita que valores antigos
  // (ex: "Qual o capital segurado?") fiquem "fantasmas" no resumo/salvamento
  // depois que a pessoa muda a resposta para "Não".
  const updateAnswerAndClearDependents = (key: string, value: any) => {
    const currentStep = current
    const dependentKeys = currentStep.type === 'question'
      ? currentStep.fields
          .filter(f => f.showIf && f.showIf.key === key && f.showIf.equals !== value)
          .map(f => f.key)
      : []
    setAnswers(prev => {
      const next = { ...prev, [key]: value }
      dependentKeys.forEach(k => { delete next[k] })
      return next
    })
  }
  const clearAnswer = (key: string) => setAnswers(prev => {
    const next = { ...prev }
    delete next[key]
    return next
  })

  const requiredFields = current.type === 'question' ? current.fields.filter(f => f.required) : []
  const canContinue = requiredFields.every(f => {
    const v = answers[f.key]
    if (f.type === 'consent') return v === true
    return v !== undefined && v !== null && String(v).trim() !== ''
  })

  const goNext = async () => {
    const next = step + 1
    setStep(next)
    if (STEPS[next]?.type === 'summary' && !salvo) {
      const result = await salvar(answers)
      if (result) setSalvo(true)
    }
  }
  const goBack = () => setStep(s => Math.max(0, s - 1))
  const resetForm = () => { setAnswers({}); setSalvo(false); setStep(0) }

  const handleEnterKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canContinue) { e.preventDefault(); goNext() }
  }

  const handleCurrencyChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '')
    if (!digits) { clearAnswer(key); return }
    updateAnswer(key, parseInt(digits, 10) / 100)
  }

  const addDependente = () => {
    const list = answers.dependentes || []
    updateAnswer('dependentes', [...list, { id: Date.now(), nome: '', idade: '' }])
  }
  const updateDependente = (id: number, field: string, value: string) => {
    const list = answers.dependentes || []
    updateAnswer('dependentes', list.map((d: any) => (d.id === id ? { ...d, [field]: value } : d)))
  }
  const removeDependente = (id: number) => {
    const list = answers.dependentes || []
    updateAnswer('dependentes', list.filter((d: any) => d.id !== id))
  }

  const toggleCheckbox = (key: string, option: string) => {
    const list = answers[key] || []
    const next = list.includes(option) ? list.filter((o: string) => o !== option) : [...list, option]
    updateAnswer(key, next)
  }

  function renderField(field: FieldDef) {
    if (field.showIf) {
      const dep = answers[field.showIf.key]
      if (dep !== field.showIf.equals) return null
    }

    const label = field.label && (
      <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>{field.label}</label>
    )

    if (field.type === 'text') {
      return (
        <div key={field.key}>
          {label}
          <input type="text" value={answers[field.key] || ''} placeholder={field.placeholder}
            onChange={e => updateAnswer(field.key, e.target.value)} onKeyDown={handleEnterKey}
            className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--border)' }} />
        </div>
      )
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.key}>
          {label}
          <textarea rows={2} value={answers[field.key] || ''} placeholder={field.placeholder}
            onChange={e => updateAnswer(field.key, e.target.value)}
            className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-y" style={{ borderColor: 'var(--border)' }} />
        </div>
      )
    }

    if (field.type === 'number') {
      return (
        <div key={field.key}>
          {label}
          <div className="flex items-center gap-2">
            <input type="number" inputMode="numeric" value={answers[field.key] ?? ''}
              onChange={e => updateAnswer(field.key, e.target.value === '' ? '' : Number(e.target.value))}
              onKeyDown={handleEnterKey}
              className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--border)' }} />
            {field.unit && <span className="text-sm flex-shrink-0" style={{ color: 'var(--muted)' }}>{field.unit}</span>}
          </div>
        </div>
      )
    }

    if (field.type === 'currency') {
      const val = answers[field.key]
      return (
        <div key={field.key}>
          {label}
          <input type="text" inputMode="numeric" placeholder="R$ 0,00"
            value={val !== undefined ? formatBRL(val) : ''}
            onChange={handleCurrencyChange(field.key)} onKeyDown={handleEnterKey}
            className="w-full border rounded-xl px-3 py-2.5 text-sm font-display outline-none" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }} />
        </div>
      )
    }

    if (field.type === 'boolean') {
      return (
        <div key={field.key}>
          {label}
          <div className="grid grid-cols-2 gap-2">
            {[true, false].map(v => {
              const selected = answers[field.key] === v
              return (
                <button key={String(v)} type="button" onClick={() => updateAnswerAndClearDependents(field.key, v)}
                  className="py-2.5 rounded-xl border text-sm font-medium transition-colors"
                  style={{
                    borderColor: selected ? 'var(--brand)' : 'var(--border)',
                    background: selected ? 'var(--brand)' : 'white',
                    color: selected ? 'white' : 'var(--ink)',
                  }}>
                  {v ? 'Sim' : 'Não'}
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    if (field.type === 'radio') {
      const opts = normalizeOptions(field.options)
      return (
        <div key={field.key}>
          {label}
          <div className="flex flex-col gap-2">
            {opts.map((opt, idx) => {
              const selected = answers[field.key] === opt.value
              return (
                <button key={opt.value} type="button" onClick={() => updateAnswer(field.key, opt.value)}
                  className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl border transition-colors"
                  style={{ borderColor: selected ? 'var(--brand)' : 'var(--border)', background: selected ? '#F0F7F3' : 'white' }}>
                  <span className="w-6 h-6 rounded-md border flex items-center justify-center text-xs flex-shrink-0"
                    style={{
                      borderColor: selected ? 'var(--brand)' : 'var(--border)',
                      background: selected ? 'var(--brand)' : 'transparent',
                      color: selected ? 'white' : 'var(--muted)',
                    }}>
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span>
                    <span className="block text-sm" style={{ color: 'var(--ink)' }}>{opt.value}</span>
                    {opt.desc && <span className="block text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{opt.desc}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    if (field.type === 'checkbox') {
      const opts = normalizeOptions(field.options)
      const list: string[] = answers[field.key] || []
      return (
        <div key={field.key}>
          {label}
          <div className="flex flex-col gap-2">
            {opts.map(opt => {
              const selected = list.includes(opt.value)
              return (
                <button key={opt.value} type="button" onClick={() => toggleCheckbox(field.key, opt.value)}
                  className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl border transition-colors"
                  style={{ borderColor: selected ? 'var(--brand)' : 'var(--border)', background: selected ? '#F0F7F3' : 'white' }}>
                  <span className="w-5 h-5 rounded-md border flex items-center justify-center text-xs flex-shrink-0"
                    style={{ borderColor: selected ? 'var(--brand)' : 'var(--border)', background: selected ? 'var(--brand)' : 'transparent', color: 'white' }}>
                    {selected ? '✓' : ''}
                  </span>
                  <span className="text-sm" style={{ color: 'var(--ink)' }}>{opt.value}</span>
                </button>
              )
            })}
          </div>
        </div>
      )
    }

    if (field.type === 'dependents') {
      const list: any[] = answers.dependentes || []
      return (
        <div key={field.key}>
          {list.length === 0 && (
            <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>Nenhum dependente adicionado ainda.</p>
          )}
          <div className="flex flex-col gap-2 mb-3">
            {list.map(dep => (
              <div key={dep.id} className="flex items-center gap-2">
                <input type="text" placeholder="Nome" value={dep.nome}
                  onChange={e => updateDependente(dep.id, 'nome', e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--border)' }} />
                <input type="number" placeholder="Idade" value={dep.idade}
                  onChange={e => updateDependente(dep.id, 'idade', e.target.value)}
                  className="w-24 flex-shrink-0 border rounded-xl px-3 py-2.5 text-sm outline-none" style={{ borderColor: 'var(--border)' }} />
                <button type="button" onClick={() => removeDependente(dep.id)} className="p-2 flex-shrink-0" style={{ color: 'var(--muted)' }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addDependente}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
            <Plus className="w-4 h-4" /> Adicionar dependente
          </button>
        </div>
      )
    }

    if (field.type === 'consent') {
      const checked = answers[field.key] === true
      return (
        <div key={field.key}>
          <label className="flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors"
            style={{ borderColor: checked ? 'var(--brand)' : 'var(--border)', background: checked ? '#F0F7F3' : 'white' }}>
            <input type="checkbox" checked={checked}
              onChange={e => updateAnswer(field.key, e.target.checked)}
              className="mt-0.5 w-4 h-4 flex-shrink-0" />
            <span className="text-sm" style={{ color: 'var(--ink)' }}>{field.label}</span>
          </label>
        </div>
      )
    }

    return null
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>Diagnóstico financeiro</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
          Um raio-x completo da sua vida financeira, em poucos minutos.
        </p>
      </div>

      {/* Barra de progresso */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, background: 'var(--brand)' }} />
      </div>

      <div className="rounded-2xl border bg-white p-6 md:p-8 space-y-6" style={{ borderColor: 'var(--border)' }}>
        {current.type === 'welcome' && (
          <>
            <h2 className="font-display text-xl md:text-2xl" style={{ color: 'var(--ink)' }}>
              Vamos estruturar a sua vida financeira.
            </h2>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Um raio-x completo da sua renda, patrimônio, riscos e objetivos — leva cerca de 10 a 15 minutos.
              Você pode fechar e voltar depois; o que já foi respondido só é salvo ao concluir.
            </p>
            <button onClick={goNext}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: 'var(--brand)' }}>
              Começar <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {current.type === 'section' && (
          <>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand)' }}>
              Etapa {current.section.num} de {SECTIONS.length}
            </p>
            <h2 className="font-display text-xl md:text-2xl" style={{ color: 'var(--ink)' }}>{current.section.title}</h2>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{current.section.subtitle}</p>
            <div className="flex items-center gap-4 pt-1">
              <button onClick={goNext}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ background: 'var(--brand)' }}>
                Continuar <ArrowRight className="w-4 h-4" />
              </button>
              {!isFirst && <button onClick={goBack} className="text-sm" style={{ color: 'var(--muted)' }}>Voltar</button>}
            </div>
          </>
        )}

        {current.type === 'question' && (
          <>
            <div>
              <h2 className="font-display text-xl md:text-2xl" style={{ color: 'var(--ink)' }}>{current.title}</h2>
              {current.subtitle && <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{current.subtitle}</p>}
            </div>
            <div className="space-y-5">
              {current.fields.map(f => renderField(f))}
            </div>
            <div className="flex items-center gap-4 pt-1">
              <button onClick={goNext} disabled={!canContinue}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--brand)' }}>
                {step === STEPS.length - 2 ? 'Finalizar' : 'Continuar'} <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={goBack} className="text-sm" style={{ color: 'var(--muted)' }}>Voltar</button>
            </div>
            {!canContinue && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {current.fields.some(f => f.required && f.type === 'consent')
                  ? 'Marque a caixa acima para continuar.'
                  : 'Preencha este campo para continuar.'}
              </p>
            )}
          </>
        )}

        {current.type === 'summary' && (
          <>
            <div className="rounded-2xl border-2 p-5 flex items-start gap-3" style={{ borderColor: 'var(--brand)', background: '#F0F7F3' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {salvando ? 'Salvando seu diagnóstico…' : salvo ? 'Diagnóstico salvo com sucesso.' : 'Prontinho.'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  {salvo
                    ? 'Vamos usar essas respostas como ponto de partida da nossa conversa.'
                    : 'Recebemos suas respostas — aqui está o resumo do que você compartilhou.'}
                </p>
                {salvo && (
                  <Link to="/" className="text-xs mt-1.5 inline-flex items-center gap-1 hover:underline" style={{ color: 'var(--brand)' }}>
                    Ir para a Visão geral →
                  </Link>
                )}
              </div>
            </div>

            {erro && <p className="text-sm text-red-600 text-center">{erro}</p>}

            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {SECTIONS.map(section => {
                const questions = QUESTIONS_BY_SECTION[section.id]
                const items: { label: string; value: string }[] = []
                questions.forEach(q => {
                  q.fields.forEach(f => {
                    if (f.showIf && answers[f.showIf.key] !== f.showIf.equals) return
                    const val = formatAnswerForDisplay(f, answers[f.key])
                    if (val) items.push({ label: f.label || q.title, value: val })
                  })
                })
                if (items.length === 0) return null
                return (
                  <div key={section.id} className="py-3 first:pt-0">
                    <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--brand)' }}>
                      {section.title}
                    </p>
                    {items.map((it, i) => (
                      <div key={i} className="flex justify-between gap-4 text-sm py-1">
                        <span style={{ color: 'var(--muted)' }}>{it.label}</span>
                        <span className="font-mono text-right" style={{ color: 'var(--ink)' }}>{it.value}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
              {(answers.telefone || answers.email) && (
                <div className="py-3">
                  <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--brand)' }}>Contato</p>
                  {answers.telefone && (
                    <div className="flex justify-between gap-4 text-sm py-1">
                      <span style={{ color: 'var(--muted)' }}>Telefone / WhatsApp</span>
                      <span className="font-mono text-right" style={{ color: 'var(--ink)' }}>{answers.telefone}</span>
                    </div>
                  )}
                  {answers.email && (
                    <div className="flex justify-between gap-4 text-sm py-1">
                      <span style={{ color: 'var(--muted)' }}>E-mail</span>
                      <span className="font-mono text-right" style={{ color: 'var(--ink)' }}>{answers.email}</span>
                    </div>
                  )}
                </div>
              )}
              {answers.termoAceite === true && (
                <div className="py-3">
                  <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--brand)' }}>Termo de responsabilidade</p>
                  <div className="flex justify-between gap-4 text-sm py-1">
                    <span style={{ color: 'var(--muted)' }}>Aceito pelo cliente</span>
                    <span className="font-mono text-right" style={{ color: 'var(--ink)' }}>Sim</span>
                  </div>
                </div>
              )}
            </div>

            <button onClick={resetForm}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
              <RotateCcw className="w-4 h-4" /> Preencher novamente
            </button>
          </>
        )}
      </div>
    </div>
  )
}
