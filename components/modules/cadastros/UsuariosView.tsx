'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Shield, User, X, Mail, Pencil, UserX, KeyRound } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'

interface Props { tenantSlug: string }

const schema = z.object({
  nome:     z.string().min(2, 'Nome obrigatório'),
  email:    z.string().email('E-mail inválido'),
  perfilId: z.coerce.number({ required_error: 'Selecione um perfil' }).int(),
})
type FormData = z.infer<typeof schema>

export default function UsuariosView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const apiBase   = `/api/${tenantSlug}/cadastros/usuarios`

  const [showForm, setShowForm]               = useState(false)
  const [successMsg, setSuccessMsg]           = useState('')
  const [formError, setFormError]             = useState('')
  const [editando, setEditando]               = useState<any>(null)
  const [editNome, setEditNome]               = useState('')
  const [editEmail, setEditEmail]             = useState('')
  const [editPerfilId, setEditPerfilId]       = useState<number | ''>('')
  const [confirmInativar, setConfirmInativar] = useState<any>(null)
  const [confirmReset, setConfirmReset]       = useState<any>(null)
  const [linkReset, setLinkReset]             = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['usuarios', tenantSlug],
    queryFn:  async () => (await fetch(apiBase)).json(),
  })

  const { data: perfisRaw } = useQuery({
    queryKey: ['perfis', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/perfis`)).json(),
  })
  const perfis: any[] = Array.isArray(perfisRaw?.data) ? perfisRaw.data : []

  // ── Criar usuário ─────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: async (payload: FormData) => {
      const perfilSelecionado = perfis.find(p => p.perfilId === payload.perfilId)
      const res = await fetch(apiBase, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome:     payload.nome,
          email:    payload.email,
          perfil:   perfilSelecionado?.isAdmin ? 'admin' : 'user',
          perfilId: payload.perfilId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao criar usuário')
      const novoId = data?.data?.usuarioId ?? data?.usuarioId
      if (novoId) {
        await fetch(`${apiBase}/${novoId}/perfil`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ perfilId: payload.perfilId }),
        }).catch(() => {})
      }
      return data
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['usuarios', tenantSlug] })
      setShowForm(false)
      setSuccessMsg(`Convite enviado para ${variables.email}`)
      setTimeout(() => setSuccessMsg(''), 5000)
    },
  })

  // ── Editar usuário (nome + email + perfil) ────────────────────────────────
  const editarMut = useMutation({
    mutationFn: async () => {
      // 1. Atualiza nome e e-mail
      const res = await fetch(`${apiBase}/${editando.usuarioId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: editNome, email: editEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao atualizar')

      // 2. Atualiza perfil se mudou
      if (editPerfilId && editPerfilId !== editando.perfilId) {
        await fetch(`${apiBase}/${editando.usuarioId}/perfil`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ perfilId: editPerfilId }),
        }).catch(() => {})
      }
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios', tenantSlug] })
      setEditando(null)
      toast('Usuário atualizado!')
    },
    onError: (err: any) => toast(err?.message ?? 'Erro ao atualizar.', 'error'),
  })

  // ── Reset de senha ────────────────────────────────────────────────────────
  const resetMut = useMutation({
    mutationFn: async (usuario: any) => {
      const res = await fetch(`${apiBase}/${usuario.usuarioId}/reset-senha`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: usuario.email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao enviar reset')
      return data
    },
    onSuccess: (data: any) => {
      if (data?.data?.tipo === 'convite_reenviado') {
        toast('Convite reenviado por e-mail!')
      } else if (data?.data?.url) {
        setLinkReset(data.data.url)
      } else {
        toast('Link de reset gerado.')
      }
    },
    onError: (err: any) => toast(err?.message ?? 'Erro ao enviar reset.', 'error'),
  })

  // ── Inativar ──────────────────────────────────────────────────────────────
  const inativarMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao inativar')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios', tenantSlug] })
      toast('Usuário deletado permanentemente.')
    },
    onError: (err: any) => toast(err?.message ?? 'Erro ao inativar.', 'error'),
  })

  const form = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setFormError('')
    try {
      await createMut.mutateAsync(data)
    } catch (err: any) {
      setFormError(err.message)
    }
  }

  function abrirEdicao(item: any) {
    setEditando(item)
    setEditNome(item.nome ?? '')
    setEditEmail(item.email ?? '')
    setEditPerfilId(item.perfilId ?? '')
  }

  const items = Array.isArray(data?.data?.data) ? data.data.data
    : Array.isArray(data?.data) ? data.data : []
  const meta  = data?.data?.meta

  function nomePerfilDoItem(item: any) {
    if (item.perfilNome) return item.perfilNome
    const p = perfis.find(p => p.perfilId === item.perfilId)
    if (p) return p.nome
    return item.perfil === 'admin' ? 'Administrador' : 'Vendedor'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Usuários</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {meta ? `${meta.total} usuário${meta.total !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <Button onClick={() => { form.reset({ perfilId: undefined }); setFormError(''); setShowForm(true) }}>
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
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum usuário encontrado.</td></tr>
            ) : items.map((item: any) => (
              <tr key={item.usuarioId} className="group border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      {item.perfil === 'admin'
                        ? <Shield size={14} className="text-green-600" />
                        : <User size={14} className="text-gray-400" />}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{item.nome}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{item.email || '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={item.perfil === 'admin' ? 'default' : 'secondary'}>
                    {nomePerfilDoItem(item)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => abrirEdicao(item)} title="Editar"
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => setConfirmReset(item)} title="Resetar senha"
                      className="p-1.5 text-gray-400 hover:text-amber-500 rounded">
                      <KeyRound size={14} />
                    </button>
                    <button onClick={() => setConfirmInativar(item)} title="Inativar"
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded">
                      <UserX size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Novo Usuário */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Novo usuário</h2>
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
                <select {...form.register('perfilId')} defaultValue=""
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                  <option value="" disabled>Selecione um perfil...</option>
                  {perfis.map(p => <option key={p.perfilId} value={p.perfilId}>{p.nome}</option>)}
                </select>
                {form.formState.errors.perfilId && <p className="text-xs text-red-500 mt-1">{form.formState.errors.perfilId.message}</p>}
                <p className="text-xs text-gray-400 mt-1">Os privilégios são definidos em Cadastros → Perfis de Acesso.</p>
              </div>
              {formError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>}
              <p className="text-xs text-gray-400">Um e-mail será enviado para o usuário definir sua senha.</p>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMut.isPending}>
                  {createMut.isPending ? 'Enviando...' : 'Criar e enviar convite'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Usuário */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Editar usuário</h2>
              <button onClick={() => setEditando(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <Label>Nome completo</Label>
                <Input value={editNome} onChange={e => setEditNome(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="mt-1" />
                <p className="text-xs text-gray-400 mt-1">Alterar o e-mail atualiza o cadastro local. O login no Clerk continuará com o e-mail anterior até o usuário fazer login novamente.</p>
              </div>
              <div>
                <Label>Perfil</Label>
                <select value={editPerfilId} onChange={e => setEditPerfilId(Number(e.target.value))}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  <option value="">Selecionar...</option>
                  {perfis.map(p => <option key={p.perfilId} value={p.perfilId}>{p.nome}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                <Button onClick={() => editarMut.mutate()} disabled={!editNome || !editEmail || editarMut.isPending}>
                  {editarMut.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal link reset */}
      {linkReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Link de acesso para reset</h2>
              <button onClick={() => setLinkReset('')} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">Copie o link abaixo e envie para o usuário. Válido por 24 horas.</p>
              <div className="bg-gray-50 rounded-lg p-3 break-all text-xs text-gray-700 font-mono">{linkReset}</div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setLinkReset('')}>Fechar</Button>
                <Button onClick={() => { navigator.clipboard.writeText(linkReset); toast('Link copiado!') }}>
                  Copiar link
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm reset senha */}
      {confirmReset && (
        <ConfirmModal
          title="Resetar senha"
          message={`Enviar e-mail de redefinição de senha para ${confirmReset.email}?`}
          confirmLabel="Enviar e-mail"
          onConfirm={() => { resetMut.mutate(confirmReset); setConfirmReset(null) }}
          onCancel={() => setConfirmReset(null)}
        />
      )}

      {/* Confirm inativar */}
      {confirmInativar && (
        <ConfirmModal
          title="Deletar usuário permanentemente"
          message={`Deletar permanentemente "${confirmInativar.nome}"? O usuário será removido do sistema e do login (Clerk). Esta ação não pode ser desfeita.`}
          confirmLabel="Deletar permanentemente"
          danger
          onConfirm={() => { inativarMut.mutate(confirmInativar.usuarioId); setConfirmInativar(null) }}
          onCancel={() => setConfirmInativar(null)}
        />
      )}
    </div>
  )
}