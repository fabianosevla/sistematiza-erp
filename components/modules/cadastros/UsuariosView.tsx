'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Shield, User, X, Mail } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface Props { tenantSlug: string }

const schema = z.object({
  nome:   z.string().min(2, 'Nome obrigatório'),
  email:  z.string().email('E-mail inválido'),
  perfil: z.enum(['admin', 'user']),
})
type FormData = z.infer<typeof schema>

export default function UsuariosView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const apiBase = `/api/${tenantSlug}/cadastros/usuarios`

  const { data, isLoading } = useQuery({
    queryKey: ['usuarios', tenantSlug],
    queryFn: async () => {
      const res = await fetch(apiBase)
      return res.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: FormData) => {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Erro ao criar usuário')
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios', tenantSlug] })
      setShowForm(false)
      setSuccessMsg(`Convite enviado para ${variables.email}`)
      setTimeout(() => setSuccessMsg(''), 5000)
    },
  })

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { perfil: 'user' },
  })

  const [formError, setFormError] = useState('')

  async function onSubmit(data: FormData) {
    setFormError('')
    try {
      await createMutation.mutateAsync(data)
    } catch (err: any) {
      setFormError(err.message)
    }
  }

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
        <Button onClick={() => { form.reset({ perfil: 'user' }); setFormError(''); setShowForm(true) }}>
          <Plus size={15} className="mr-1.5" /> Novo usuário
        </Button>
      </div>

      {successMsg && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <Mail size={15} className="text-green-600" />
          <p className="text-sm text-green-700">{successMsg}</p>
        </div>
      )}

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

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Novo usuário</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div>
                <Label>Nome completo *</Label>
                <Input {...form.register('nome')} className="mt-1" placeholder="João Silva" />
                {form.formState.errors.nome && <p className="text-xs text-red-500 mt-1">{form.formState.errors.nome.message}</p>}
              </div>
              <div>
                <Label>E-mail *</Label>
                <Input {...form.register('email')} type="email" className="mt-1" placeholder="joao@empresa.com" />
                {form.formState.errors.email && <p className="text-xs text-red-500 mt-1">{form.formState.errors.email.message}</p>}
              </div>
              <div>
                <Label>Perfil *</Label>
                <select {...form.register('perfil')} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                  <option value="user">Usuário</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
              )}

              <p className="text-xs text-gray-400">
                Um e-mail será enviado para o usuário definir sua senha e acessar o sistema.
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Enviando...' : 'Criar e enviar convite'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}