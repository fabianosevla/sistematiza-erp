'use client'
// components/ui/AuditoriaInfo.tsx
//
// Mostra quem criou e quem alterou o registro — pelo NOME, não pelo ID.
//
// A tradução acontece aqui, não em cada tela: o componente descobre o tenant
// pela URL e busca uma vez o mapa { id: nome }. O react-query compartilha esse
// mapa entre todas as telas e mantém em cache, então abrir dez cadastros não
// gera dez requisições.
//
// Nenhuma tela que já usa <AuditoriaInfo> precisa mudar: a assinatura das
// props continua a mesma.
import { useQuery } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'

interface Props {
  criadoPor?:     string | number | null
  criadoEm?:      string | null
  atualizadoPor?: string | number | null
  atualizadoEm?:  string | null
  className?:     string
}

function fmtDt(d: string | null | undefined) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function AuditoriaInfo({ criadoPor, criadoEm, atualizadoPor, atualizadoEm, className = '' }: Props) {
  // Primeiro segmento da rota é o slug do tenant (/[tenant]/cadastros/...).
  const pathname = usePathname()
  const tenantSlug = (pathname ?? '').split('/').filter(Boolean)[0] ?? ''

  const { data: nomesRaw } = useQuery({
    queryKey: ['usuarios-nomes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/usuarios/nomes`)).json(),
    enabled:  !!tenantSlug,
    staleTime: 5 * 60 * 1000,   // nome de usuário quase não muda
  })
  const nomes: Record<string, string> = nomesRaw?.data ?? {}

  // Se já vier o nome pronto da API, respeita. Se vier ID, traduz.
  // ID desconhecido continua aparecendo — some com "—" seria pior, esconderia
  // que o registro tem autor.
  function exibir(valor: string | number | null | undefined): string {
    if (valor === null || valor === undefined || valor === '') return '—'
    const s = String(valor).trim()
    if (!/^\d+$/.test(s)) return s
    return nomes[s] ?? `Usuário ${s}`
  }

  return (
    <div className={`grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-400 ${className}`}>
      <div>
        <span className="font-medium text-gray-500">Criado por:</span>{' '}
        {exibir(criadoPor)}
      </div>
      <div>
        <span className="font-medium text-gray-500">Criado em:</span>{' '}
        {fmtDt(criadoEm)}
      </div>
      <div>
        <span className="font-medium text-gray-500">Atualizado por:</span>{' '}
        {exibir(atualizadoPor)}
      </div>
      <div>
        <span className="font-medium text-gray-500">Atualizado em:</span>{' '}
        {fmtDt(atualizadoEm)}
      </div>
    </div>
  )
}

export default AuditoriaInfo