// Preferência de tema: claro, escuro ou seguir o sistema. Fica só neste navegador.
export type TemaPref = 'claro' | 'escuro' | 'sistema'
const CHAVE = 'arsen.tema'

export function lerTema(): TemaPref {
  try {
    const v = localStorage.getItem(CHAVE)
    return v === 'escuro' || v === 'sistema' ? v : 'claro'
  } catch { return 'claro' }
}

export function aplicarTema(pref: TemaPref) {
  const escuro = pref === 'escuro' || (pref === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.toggleAttribute('data-theme', escuro)
  if (escuro) document.documentElement.setAttribute('data-theme', 'dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', escuro ? '#0B110E' : '#24352C')
}

export function salvarTema(pref: TemaPref) {
  try { localStorage.setItem(CHAVE, pref) } catch { /* sem armazenamento: vale só nesta sessão */ }
  aplicarTema(pref)
}
