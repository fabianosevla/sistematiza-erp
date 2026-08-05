'use client'
import type { ReactNode } from 'react'
import { SidePanel } from '@/components/ui/SidePanel'

/**
 * components/ui/FormModal.tsx
 *
 * ─── NÃO É MAIS UM MODAL ─────────────────────────────────────────────────────
 *
 * Formulário de cadastro agora acontece no painel lateral direito. Este arquivo
 * virou uma casca fina sobre o SidePanel, mantendo a MESMA assinatura de props
 * que as ~30 telas já usam — trocar aqui converteu o sistema inteiro sem tocar
 * em nenhuma tela.
 *
 * O nome foi mantido de propósito: renomear obrigaria a mexer em todos os
 * imports, o que é risco sem retorno. Em telas novas, importe SidePanel direto.
 *
 * `largura` continua sendo aceita e é traduzida para a largura do painel — um
 * formulário que pedia max-w-4xl não caberia num quarto de tela.
 *
 * Modal de verdade continua existindo só para CONFIRMAÇÃO: ConfirmModal.
 */
interface Props {
  titulo:      ReactNode
  onClose:     () => void
  children:    ReactNode
  /** largura do modal antigo: max-w-sm | max-w-lg | max-w-2xl | max-w-4xl… */
  largura?:    string
  /** linha de apoio abaixo do título */
  subtitulo?:  ReactNode
  /** conteúdo opcional colado ao título (selo, InfoTip, contador) */
  cabecalho?:  ReactNode
  /** mantida por compatibilidade — o painel sempre fecha no Esc */
  fecharNoEsc?: boolean
}

// Formulário largo continua largo. Sem este mapa, a tela de Perfis — que tem
// uma grade de módulos em três colunas — ficaria espremida em 420px.
const LARGURA_PAINEL: Record<string, string> = {
  'max-w-xs':  'w-[24vw] min-w-[400px]',
  'max-w-sm':  'w-[24vw] min-w-[400px]',
  'max-w-md':  'w-[25vw] min-w-[440px]',
  'max-w-lg':  'w-[28vw] min-w-[480px]',
  'max-w-xl':  'w-[32vw] min-w-[540px]',
  'max-w-2xl': 'w-[36vw] min-w-[600px]',
  'max-w-3xl': 'w-[42vw] min-w-[680px]',
  'max-w-4xl': 'w-[48vw] min-w-[760px]',
}

export function FormModal({
  titulo, onClose, children,
  largura = 'max-w-2xl',
  subtitulo,
  cabecalho,
}: Props) {
  return (
    <SidePanel
      titulo={typeof titulo === 'string' ? titulo : String(titulo ?? '')}
      subtitulo={typeof subtitulo === 'string' ? subtitulo : undefined}
      cabecalho={cabecalho}
      onClose={onClose}
      largura={LARGURA_PAINEL[largura] ?? 'w-[32vw] min-w-[540px]'}
    >
      {children}
    </SidePanel>
  )
}

export default FormModal