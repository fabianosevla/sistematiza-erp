import type { ComponentType } from 'react'

interface Props {
  icon?: ComponentType<{ size?: number; className?: string }>
  title: string
  description?: string
  action?: string
  onAction?: () => void
}

export function EmptyState({ icon: Icon, title, description, action, onAction }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Icon size={20} className="text-gray-400" />
        </div>
      )}
      <p className="text-sm font-semibold text-gray-700 mb-1">{title}</p>
      {description && <p className="text-xs text-gray-400 max-w-xs mb-4">{description}</p>}
      {action && onAction && (
        <button onClick={onAction} className="text-sm text-green-600 hover:text-green-700 font-medium hover:underline">
          {action}
        </button>
      )}
    </div>
  )
}