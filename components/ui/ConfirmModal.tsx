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
import { Button } from '@/components/ui/button'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="lg" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
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
