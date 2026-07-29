'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Shield, User, Mail, Pencil, UserX, KeyRound } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { FormModal } from '@/components/ui/FormModal'
import { Aviso } from '@/components/ui/Aviso'

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

  const colunas: Coluna[] = [
    {
      chave: 'nome', titulo: 'Nome',
      classeCelula: 'px-4 py-3',
      render: (item: any) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            {item.perfil === 'admin'
              ? <Shield size={14} className="text-green-600" />
              : <User size={14} className="text-gray-400" />}
          </div>
          <span className="text-sm font-medium text-gray-900">{item.nome}</span>
        </div>
      ),
    },
    {
      chave: 'email', titulo: 'E-mail', esconderAte: 'md',
      render: (item: any) => item.email || '—',
    },
    {
      chave: 'perfil', titulo: 'Perfil',
      classeCelula: 'px-4 py-3',
      render: (item: any) => (
        <Badge variant={item.perfil === 'admin' ? 'default' : 'secondary'}>
          {nomePerfilDoItem(item)}
        </Badge>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        titulo="Usuários"
        subtitulo={meta ? `${meta.total} usuário${meta.total !== 1 ? 's' : ''}` : ''}
        acoes={
          <Button onClick={() => { form.reset({ perfilId: undefined }); setFormError(''); setShowForm(true) }}>
            <Plus size={15} className="mr-1.5" /> Novo usuário
          </Button>
        }
      />

      {successMsg && (
        <Aviso tom="sucesso" className="mb-4" icone={<Mail size={15} className="text-green-600" />}>
          {successMsg}
        </Aviso>
      )}

      <DataTable
        colunas={colunas}
        itens={items}
        chave={(item: any) => item.usuarioId}
        carregando={isLoading}
        vazio="Nenhum usuário encontrado."
        acoes={(item: any) => (
          <>
            <BotaoIcone titulo="Editar" variante="info" tamanho="md" onClick={() => abrirEdicao(item)}>
              <Pencil size={14} />
            </BotaoIcone>
            <BotaoIcone titulo="Resetar senha" variante="alerta" tamanho="md" onClick={() => setConfirmReset(item)}>
              <KeyRound size={14} />
            </BotaoIcone>
            <BotaoIcone titulo="Inativar" variante="perigo" tamanho="md" onClick={() => setConfirmInativar(item)}>
              <UserX size={14} />
            </BotaoIcone>
          </>
        )}
      />

      {/* Modal Novo Usuário */}
      {showForm && (
        <FormModal titulo="Novo usuário" onClose={() => setShowForm(false)} largura="max-w-md">
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
            {formError && <Aviso tom="erro">{formError}</Aviso>}
            <p className="text-xs text-gray-400">Um e-mail será enviado para o usuário definir sua senha.</p>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? 'Enviando...' : 'Criar e enviar convite'}
              </Button>
            </div>
          </form>
        </FormModal>
      )}

      {/* Modal Editar Usuário */}
      {editando && (
        <FormModal titulo="Editar usuário" onClose={() => setEditando(null)} largura="max-w-md">
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
              <select value={String(editPerfilId ?? "")} onChange={e => setEditPerfilId(Number(e.target.value))}
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
        </FormModal>
      )}

      {/* Modal link reset */}
      {linkReset && (
        <FormModal titulo="Link de acesso para reset" onClose={() => setLinkReset('')} largura="max-w-md">
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
        </FormModal>
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