'use client'
// components/ui/ConfirmModal.tsx
//
// Confirmação continua sendo modal — é a única coisa que ainda é, por decisão
// do projeto. O que mudou aqui foi o botão.
//
// Antes eram <button> crus com bg-red-600 / bg-green-600: vermelho e verde
// sólidos, saturados, que não existem em nenhum outro lugar do sistema. Ao
// lado da interface clara isso soava como aviso de sistema operacional, não
// como uma ação da ferramenta.
//
// Agora usa o <Button>, que já tinha a variante certa:
//   destructive → bg-red-50 / text-red-600 / border-red-200
// É o mesmo desenho do botão padrão (verde suave), só que na família vermelha.
// Discreto, e coerente com "Novo", "Salvar" e "Confirmar" do resto do app.
//
// ─── TECLADO (13/09/2026) ───────────────────────────────────────────────────
//
// Pedido veio do PDV ("Deseja imprimir cupom?"), mas o atalho é do
// COMPONENTE, não da tela — toda confirmação Sim/Não do sistema ganha isso
// junto, de graça, porque é aqui que mora.
//
//   Enter   → confirma (o botão de confirmar já nasce selecionado)
//   ← / →   → troca a seleção entre Cancelar e Confirmar
//   Esc     → cancela
//
// Seleção é foco real do DOM (não estado decorativo): o botão focado recebe
// o anel verde que o <Button> já tem embutido (focus-visible:ring), e Enter
// aciona o que estiver focado — o mesmo comportamento nativo de um <button>,
// só com a troca por seta entre os dois.
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  title: string
  message: string
  /** Conteúdo extra entre a mensagem e os botões — ex.: total da venda, nota. */
  children?: ReactNode
  /** Ícone centralizado acima do título — ex.: check verde de sucesso. */
  icon?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  message,
  children,
  icon,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef  = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Confirmar nasce selecionado — é a ação mais provável (fechar o ciclo do
  // Enter que já vem avançando campo a campo em quem chama isto de dentro de
  // um formulário).
  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopImmediatePropagation()
        onCancel()
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); e.stopImmediatePropagation()
        const alvo = document.activeElement === confirmRef.current ? cancelRef.current : confirmRef.current
        alvo?.focus()
        return
      }
      // Enter em cima de um botão focado já aciona o clique nativamente — não
      // precisa de tratamento próprio aqui. O que falta é só isso: os dois
      // atalhos que o navegador não dá de graça.
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        {icon && <div className="flex justify-center mb-2">{icon}</div>}
        <h3 className={`text-base font-semibold text-gray-900 mb-2 ${icon ? 'text-center' : ''}`}>{title}</h3>
        {/* whitespace-pre-line: a mensagem às vezes traz uma lista com quebra
            de linha — sem isto tudo colapsa num parágrafo só. */}
        <p className={`text-sm text-gray-500 whitespace-pre-line ${icon ? 'text-center' : ''} ${children ? '' : 'mb-6'}`}>{message}</p>
        {children && <div className="mt-1 mb-6">{children}</div>}
        <div className={`flex gap-2 ${icon ? 'justify-center' : 'justify-end'}`}>
          <Button ref={cancelRef} variant="outline" size="lg" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={danger ? 'destructive' : 'default'}
            size="lg"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
