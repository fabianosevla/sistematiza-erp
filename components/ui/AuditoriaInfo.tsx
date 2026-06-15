interface Props {
  criadoPor?:    string | number | null
  criadoEm?:     string | null
  atualizadoPor?: string | number | null
  atualizadoEm?:  string | null
  className?:    string
}

function fmtDt(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function AuditoriaInfo({ criadoPor, criadoEm, atualizadoPor, atualizadoEm, className = '' }: Props) {
  return (
    <div className={`grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-400 ${className}`}>
      <div>
        <span className="font-medium text-gray-500">Criado por:</span>{' '}
        {criadoPor ?? '—'}
      </div>
      <div>
        <span className="font-medium text-gray-500">Criado em:</span>{' '}
        {fmtDt(criadoEm)}
      </div>
      <div>
        <span className="font-medium text-gray-500">Atualizado por:</span>{' '}
        {atualizadoPor ?? '—'}
      </div>
      <div>
        <span className="font-medium text-gray-500">Atualizado em:</span>{' '}
        {fmtDt(atualizadoEm)}
      </div>
    </div>
  )
}