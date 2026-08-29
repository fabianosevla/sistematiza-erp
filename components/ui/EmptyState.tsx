// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComponent = React.ComponentType<any>

interface Props {
  icon?: IconComponent
  title: string
  description?: string
  action?: string
  onAction?: () => void
}

export function EmptyState({ icon: Icon, title, description, action, onAction }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && (
        <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
          <Icon size={18} className="text-gray-400" />
        </div>
      )}
      <p className="text-[13.5px] font-medium text-gray-800 mb-1">{title}</p>
      {description && <p className="text-[12.5px] text-gray-400 max-w-xs mb-4">{description}</p>}
      {action && onAction && (
        <button onClick={onAction} className="text-[13px] text-green-700 hover:text-green-600 font-medium">
          {action}
        </button>
      )}
    </div>
  )
}
