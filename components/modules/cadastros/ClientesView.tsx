'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Pencil, X, Upload, Clock, Trash2, Eye, EyeOff } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { clienteInsertSchema, type ClienteInsertInput } from '@/lib/validations/cadastros'
import ImportacaoModal from '@/components/modules/importacao/ImportacaoModal'
import { HistoricoModal } from '@/components/ui/HistoricoModal'
import { AuditoriaInfo } from '@/components/ui/AuditoriaInfo'

interface Props { tenantSlug: string }

export default function ClientesView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(1)
  const [showForm, setShowForm]       = useState(false)
  const [showImport, setShowImport]   = useState(false)
  const [showHistorico, setShowHistorico] = useState<any>(null)
  const [editItem, setEditItem]       = useState<any>(null)
  const [incluirInativos, setIncluirInativos] = useState(false)
  const [confirmDelete, setConfirmDelete]     = useState<any>(null)
  const [formError, setFormError]     = useState('')
  const [flash, setFlash]             = useState('')
  const apiBase = `/api/${tenantSlug}/cadastros/clientes`

  const flashMsg = (m: string) => { setFlash(m); setTimeout(() => setFlash(''), 4000) }

  const { data, isLoading } = useQuery({
    queryKey: ['clientes', tenantSlug, page, search, incluirInativos],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.set('search', search)
      if (incluirInativos) params.set('incluirInativos', 'true')
      const res = await fetch(`${apiBase}?${params}`)
      return res.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: ClienteInsertInput) => {
      const res = await fetch(apiBase, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json()
      // Sem esse check, um 400 "Registro já existente" caía em onSuccess e fechava o form.
      if (!res.ok) throw new Error(json?.message ?? 'Erro ao salvar cliente')
      return json
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clientes', tenantSlug] }); setShowForm(false); setFormError('') },
    onError: (e: any) => setFormError(e?.message ?? 'Erro ao salvar.'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await fetch(`${apiBase}/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message ?? 'Erro ao salvar cliente')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes', tenantSlug] })
      setShowForm(false); setEditItem(null); setFormError('')
    },
    onError: (e: any) => setFormError(e?.message ?? 'Erro ao salvar.'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${apiBase}?id=${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message ?? 'Erro ao excluir cliente')
      return json
    },
    onSuccess: (json: any) => {
      queryClient.invalidateQueries({ queryKey: ['clientes', tenantSlug] })
      setConfirmDelete(null)
      flashMsg(json?.data?.message ?? 'Cliente removido.')
    },
    onError: (e: any) => { setConfirmDelete(null); flashMsg(e?.message ?? 'Erro ao excluir.') },
  })

  const form = useForm<ClienteInsertInput>({ resolver: zodResolver(clienteInsertSchema) })

  function handleNew() {
    form.reset({ tipoPessoa: 'PF' }); setEditItem(null); setFormError(''); setShowForm(true)
  }

  function handleEdit(item: any) {
    setEditItem(item); setFormError('')
    form.reset({
      tipoPessoa: item.tipoPessoa, nomeCompleto: item.nomeCompleto, nomeFantasia: item.nomeFantasia,
      documento: item.documento, email: item.email, telefone: item.telefone, celular: item.celular,
      cep: item.cep, endereco: item.endereco, numero: item.numero, complemento: item.complemento,
      bairro: item.bairro, cidade: item.cidade, uf: item.uf, observacao: item.observacao,
    })
    setShowForm(true)
  }

  function onSubmit(data: ClienteInsertInput) {
    if (editItem) {
      updateMutation.mutate({ id: editItem.clienteId, payload: { ...data, modificationNum: editItem.modificationNum } })
    } else {
      createMutation.mutate(data)
    }
  }

  const clientes  = data?.data?.data ?? []
  const meta      = data?.data?.meta
  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-400 mt-0.5">{meta ? `${meta.total} registro${meta.total !== 1 ? 's' : ''}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setIncluirInativos(v => !v); setPage(1) }}>
            {incluirInativos ? <Eye size={14} className="mr-1.5" /> : <EyeOff size={14} className="mr-1.5" />}
            {incluirInativos ? 'Vendo inativos' : 'Ver inativos'}
          </Button>
          <Button variant="outline" onClick={() => setShowImport(true)}><Upload size={14} className="mr-1.5" /> Importar</Button>
          <Button onClick={handleNew}><Plus size={15} className="mr-1.5" /> Novo cliente</Button>
        </div>
      </div>

      {flash && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2.5">{flash}</div>
      )}

      {showImport && (
        <ImportacaoModal tenantSlug={tenantSlug} entidade="clientes" queryKey="clientes" onClose={() => setShowImport(false)} />
      )}

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Buscar clientes..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Nome</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Tipo</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">E-mail</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">Cidade</th>
              <th className="px-4 py-3 w-28" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
            ) : clientes.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum cliente encontrado.</td></tr>
            ) : clientes.map((c: any) => (
              <tr key={c.clienteId} className={`group border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${c.activeFlag === false ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  <span className="flex items-center gap-2">
                    {c.nomeCompleto}
                    {c.activeFlag === false && <Badge variant="outline" className="text-gray-400">Inativo</Badge>}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell"><Badge variant={c.tipoPessoa === 'PJ' ? 'secondary' : 'outline'}>{c.tipoPessoa}</Badge></td>
                <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">{c.email ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">{c.cidade ? `${c.cidade}/${c.uf ?? ''}` : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setShowHistorico(c)} title="Histórico" className="p-1 text-purple-400 hover:text-purple-600"><Clock size={14} /></button>
                    <button onClick={() => handleEdit(c)} title="Editar" className="p-1 text-gray-300 hover:text-green-600 transition-colors"><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDelete(c)} title="Excluir" className="p-1 text-gray-300 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">Página {meta.page} de {meta.totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Próximo</Button>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{editItem ? 'Editar cliente' : 'Novo cliente'}</h2>
              <button onClick={() => { setShowForm(false); setEditItem(null); setFormError('') }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4">
              {formError && (
                <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de pessoa *</Label>
                  <select {...form.register('tipoPessoa')} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                    <option value="PF">Pessoa Física</option>
                    <option value="PJ">Pessoa Jurídica</option>
                  </select>
                </div>
                <div><Label>Documento (CPF/CNPJ)</Label><Input {...form.register('documento')} className="mt-1" placeholder="000.000.000-00" /></div>
              </div>
              <div>
                <Label>Nome completo / Razão social *</Label>
                <Input {...form.register('nomeCompleto')} className="mt-1" />
                {form.formState.errors.nomeCompleto && <p className="text-xs text-red-500 mt-1">{form.formState.errors.nomeCompleto.message}</p>}
              </div>
              <div><Label>Nome fantasia</Label><Input {...form.register('nomeFantasia')} className="mt-1" /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>E-mail</Label><Input {...form.register('email')} type="email" className="mt-1" /></div>
                <div><Label>Celular</Label><Input {...form.register('celular')} className="mt-1" placeholder="(35) 99999-9999" /></div>
                <div><Label>Telefone</Label><Input {...form.register('telefone')} className="mt-1" placeholder="(35) 3333-3333" /></div>
              </div>
              {/* CORREÇÃO (dados ocultos): endereço completo existia no banco mas não aparecia no formulário */}
              <div className="grid grid-cols-3 gap-4">
                <div><Label>CEP</Label><Input {...form.register('cep')} className="mt-1" placeholder="00000-000" /></div>
                <div className="col-span-2"><Label>Endereço</Label><Input {...form.register('endereco')} className="mt-1" placeholder="Rua, avenida…" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Número</Label><Input {...form.register('numero')} className="mt-1" /></div>
                <div><Label>Complemento</Label><Input {...form.register('complemento')} className="mt-1" /></div>
                <div><Label>Bairro</Label><Input {...form.register('bairro')} className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2"><Label>Cidade</Label><Input {...form.register('cidade')} className="mt-1" /></div>
                <div><Label>UF</Label><Input {...form.register('uf')} className="mt-1" maxLength={2} /></div>
              </div>
              <div>
                <Label>Observação</Label>
                <textarea {...form.register('observacao')} rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
              </div>

              {editItem && (
                <AuditoriaInfo
                  criadoPor={editItem.createdBy}
                  criadoEm={editItem.createdDt}
                  atualizadoPor={editItem.updatedBy}
                  atualizadoEm={editItem.updatedDt}
                  className="pt-3 border-t border-gray-100"
                />
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditItem(null); setFormError('') }}>Cancelar</Button>
                <Button type="submit" disabled={isPending}>{isPending ? 'Salvando...' : editItem ? 'Salvar alterações' : 'Salvar cliente'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Excluir cliente"
          message={`Excluir "${confirmDelete.nomeCompleto}"? Se ele tiver vendas associadas, será apenas inativado (histórico preservado).`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => deleteMutation.mutate(confirmDelete.clienteId)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {showHistorico && (
        <HistoricoModal
          tenantSlug={tenantSlug}
          entidade="cliente"
          entidadeId={showHistorico.clienteId}
          titulo={showHistorico.nomeCompleto}
          onClose={() => setShowHistorico(null)}
        />
      )}
    </div>
  )
}