'use client'
import { Menu, Store } from 'lucide-react'

/**
 * components/layout/Header.tsx
 *
 * ─── SÓ O PDV FICA AQUI ───────────────────────────────────────────────────
 *
 * Notificações, Configurações, modo escuro e Sair saíram da barra e viraram
 * itens do menu lateral (Configurações virou rota própria em
 * /[tenant]/configuracoes, como todo o resto do sistema já era — era a única
 * tela que abria como painel em vez de página). Notificações foi removida
 * por completo, não só realocada — ver app/api/[tenant]/notificacoes
 * (apagado) se a funcionalidade voltar a fazer sentido no futuro.
 *
 * O que sobra aqui é só atalho: abrir o menu no celular e ir para o PDV, que
 * é ambiente separado do gerencial e por isso não vive dentro do Sidebar.
 */

interface Props {
  tenantSlug:      string
  logoBase64:      string | null
  onToggleSidebar: () => void
}

export default function Header({ tenantSlug, logoBase64, onToggleSidebar }: Props) {
  return (
    <header className="h-14 bg-white dark:bg-[#0F1117] border-b border-gray-200 dark:border-white/5 flex items-center justify-between px-5 flex-shrink-0 z-20">
      {/* Botão hamburger (mobile) */}
      <button
        onClick={onToggleSidebar}
        className="lg:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
      >
        <Menu size={20} />
      </button>

      {/* Logo / Nome */}
      <div className="hidden lg:flex items-center gap-3 ml-2">
        {logoBase64 ? (
          <img src={logoBase64} alt="Logo" className="h-7 w-auto object-contain" />
        ) : (
          <div className="flex items-center gap-2">
            <img src="/apple-icon.png" alt="" className="h-6 w-6 object-contain rounded" />
            <div className="flex items-baseline">
              <span className="text-sm font-bold text-gray-900">Sistematiza</span>
              <span className="text-sm font-bold" style={{ color: '#2ecc71' }}>.ai</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Atalho PDV (ambiente separado) — disponível para todos. */}
      <a
        href={`/${tenantSlug}/pdv`}
        className="inline-flex items-center gap-2 h-8 px-3.5 rounded-lg bg-gray-100 text-gray-900 text-[12.5px] font-bold hover:bg-gray-200 transition-colors"
        title="Abrir PDV"
      >
        <Store size={16} /> PDV
      </a>
    </header>
  )
}
