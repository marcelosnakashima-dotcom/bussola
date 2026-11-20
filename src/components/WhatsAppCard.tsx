import { useCallback, useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { normalizeBrPhone } from '../../supabase/functions/_shared/whatsapp-core'

// Número do WhatsApp da Arsen que recebe os gastos (só dígitos, ex.: 5511999999999).
const BOT = (import.meta.env.VITE_WHATSAPP_NUMERO as string | undefined)?.replace(/\D/g, '') ?? ''

type Vinculo = { phone: string; status: 'pendente' | 'ativo'; verified_at: string | null; code_expires_at: string | null }

const fmtPhone = (p: string) => `+${p.slice(0, 2)} (${p.slice(2, 4)}) ${p.slice(4, 9)}-${p.slice(9)}`

export function WhatsAppCard() {
  const [vinculo, setVinculo] = useState<Vinculo | null>(null)
  const [loading, setLoading] = useState(true)
  const [telefone, setTelefone] = useState('')
  const [codigo, setCodigo] = useState<{ codigo: string; expira: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmarRevogar, setConfirmarRevogar] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('whatsapp_meu_vinculo')
    if (error) setErro('Não foi possível carregar o vínculo do WhatsApp.')
    setVinculo((data as Vinculo[] | null)?.[0] ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const gerar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    const phone = normalizeBrPhone(telefone)
    if (!phone) { setErro('Informe um celular brasileiro com DDD, por exemplo (11) 91234-5678.'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('whatsapp_iniciar_vinculo', { p_phone: phone })
    setBusy(false)
    if (error) {
      setErro(/outra conta/.test(error.message) ? 'Este número já está vinculado a outra conta.' : 'Não foi possível gerar o código. Tente novamente.')
      return
    }
    const row = (data as { codigo: string; expira_em: string }[])[0]
    setCodigo({ codigo: row.codigo, expira: row.expira_em })
    await carregar()
  }

  const revogar = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('whatsapp_revogar')
    setBusy(false)
    setConfirmarRevogar(false)
    if (error) { setErro('Não foi possível desvincular. Tente novamente.'); return }
    setCodigo(null)
    await carregar()
  }

  const card = 'rounded-3xl glass p-5 space-y-3'
  const btn = 'px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-60'

  return (
    <div className={card}>
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4" style={{ color: 'var(--brand)' }} />
        <h3 className="font-medium" style={{ color: 'var(--ink)' }}>Gastos pelo WhatsApp</h3>
      </div>

      {loading ? (
        <div className="h-5 w-48 rounded animate-pulse" style={{ background: 'var(--border)' }} />
      ) : vinculo?.status === 'ativo' ? (
        <>
          <p className="text-sm" style={{ color: 'var(--ink)' }}>
            Vinculado ao número <strong>{fmtPhone(vinculo.phone)}</strong>.
          </p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Envie para {BOT ? <strong>{fmtPhone(BOT)}</strong> : 'o WhatsApp da Arsen'} uma frase como <em>mercado 85,90</em>,
            um áudio ou a foto de um cupom. Eu mostro o que entendi e só registro depois do seu <em>sim</em>.
          </p>
          {confirmarRevogar ? (
            <p className="text-sm">
              Desvincular este número?{' '}
              <button onClick={revogar} disabled={busy} className="underline font-medium text-danger disabled:opacity-50">Sim, desvincular</button>{' '}
              <button onClick={() => setConfirmarRevogar(false)} className="underline" style={{ color: 'var(--muted)' }}>Não</button>
            </p>
          ) : (
            <button onClick={() => setConfirmarRevogar(true)} className="text-sm underline" style={{ color: 'var(--muted)' }}>Desvincular</button>
          )}
        </>
      ) : codigo && vinculo?.status === 'pendente' ? (
        <>
          <p className="text-sm" style={{ color: 'var(--ink)' }}>
            Do celular <strong>{fmtPhone(vinculo.phone)}</strong>, envie esta mensagem
            {BOT ? <> para <strong>{fmtPhone(BOT)}</strong></> : ' para o WhatsApp da Arsen'}:
          </p>
          <p className="font-mono text-2xl tracking-widest" style={{ color: 'var(--ink)' }}>codigo {codigo.codigo}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Vale até {new Date(codigo.expira).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Não compartilhe este código.
          </p>
          <div className="flex gap-2 flex-wrap">
            {BOT && (
              <a href={`https://wa.me/${BOT}?text=${encodeURIComponent(`codigo ${codigo.codigo}`)}`} target="_blank" rel="noreferrer"
                className={btn} style={{ background: 'var(--brand)' }}>
                Abrir o WhatsApp
              </a>
            )}
            <button onClick={carregar} className="px-4 py-2.5 rounded-xl text-sm border" style={{ borderColor: 'var(--border)' }}>
              Já enviei
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={gerar} className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Registre gastos mandando uma mensagem no WhatsApp. Informe o seu celular para gerar um código de vínculo.
            {vinculo?.status === 'pendente' && ' O código anterior não foi confirmado; gere outro.'}
          </p>
          <input type="tel" inputMode="tel" value={telefone} onChange={e => setTelefone(e.target.value)}
            placeholder="(11) 91234-5678" required
            className="w-full md:max-w-xs border rounded-xl px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Ao vincular, você autoriza a Arsen a receber as mensagens que enviar a este número para registrar seus lançamentos.
            O texto e as fotos são interpretados por IA; nada é gravado sem a sua confirmação.
          </p>
          <button type="submit" disabled={busy} className={btn} style={{ background: 'var(--brand)' }}>
            {busy ? 'Gerando...' : 'Gerar código'}
          </button>
        </form>
      )}

      {erro && <p className="text-sm text-danger">{erro}</p>}
    </div>
  )
}
