'use client'
import { useQuery } from '@tanstack/react-query'
import { Shield, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Props { tenantSlug: string }

export default function UsuariosView({ tenantSlug }: Props) {
  const apiBase = `/api/${tenantSlug}/cadastros/usuarios`

  const { data, isLoading } = useQuery({
    queryKey: ['usuarios', tenantSlug],
    queryFn: async () => {
      const res = await fetch(apiBase)
      return res.json()
    },
  })

  const items = data?.data?.data ?? []
  const meta  = data?.data?.meta

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Usuários</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {meta ? `${meta.total} usuário${meta.total !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Nome</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">E-mail</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Perfil</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={3} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum usuário encontrado.</td></tr>
            ) : items.map((item: any) => (
              <tr key={item.usuarioId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      {item.perfil === 'admin'
                        ? <Shield size={14} className="text-green-600" />
                        : <User size={14} className="text-gray-400" />
                      }
                    </div>
                    <span className="text-sm font-medium text-gray-900">{item.nome}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{item.email || '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={item.perfil === 'admin' ? 'default' : 'secondary'}>
                    {item.perfil === 'admin' ? 'Admin' : 'Usuário'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}