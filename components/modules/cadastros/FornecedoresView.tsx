'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Pencil, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { fornecedorInsertSchema, type FornecedorInsertInput } from '@/lib/validations/cadastros'

interface Props { tenantSlug: string }

export default function FornecedoresView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const apiBase = `/api/${tenantSlug}/cadastros/fornecedores`

  const { data, isLoading } = useQuery({
    queryKey: ['fornecedores', tenantSlug, page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.set('search', search)
      const res = await fetch(`${apiBase}?${params}`)
      return res.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: FornecedorInsertInput) => {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fornecedores', tenantSlug] })
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await fetch(`${apiBase}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fornecedores', tenantSlug] })
      setShowForm(false)
      setEditItem(null)
    },
  })

  const form = useForm<FornecedorInsertInput>({ resolver: zodResolver(fornecedorInsertSchema) })

  function handleNew() {
    form.reset({ tipoPessoa: 'PJ' })
    setEditItem(null)
    setShowForm(true)
  }

  function handleEdit(item: any) {
    setEditItem(item)
    form.reset({
      tipoPessoa:   item.tipoPessoa,
      nomeCompleto: item.nomeCompleto,
      nomeFantasia: item.nomeFantasia,
      cnpjCpf:      item.cnpjCpf,
      email:        item.email,
      telefone:     item.telefone,
      celular:      item.celular,
      contato:      item.contato,
      cep:          item.cep,
      endereco:     item.endereco,
      numero:       item.numero,
      complemento:  item.complemento,
      bairro:       item.bairro,
      cidade:       item.cidade,
      uf:           item.uf,
      observacao:   item.observacao,
    })
    setShowForm(true)
  }

  function onSubmit(data: FornecedorInsertInput) {
    if (editItem) {
      updateMutation.mutate({ id: editItem.fornecedorId, payload: { ...data, modificationNum: editItem.modificationNum } })
    } else {
      createMutation.mutate(data)
    }
  }

  const items = data?.data?.data ?? []
  const meta  = data?.data?.meta
  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Fornecedores</h1>
          <p className="text-sm text-gray-400 mt-0.5">{meta ? `${meta.total} registro${meta.total !== 1 ? 's' : ''}` : ''}</p>
        </div>
        <Button onClick={handleNew}>
          <Plus size={15} className="mr-1.5" /> Novo fornecedor
        </Button>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Buscar fornecedores..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Nome</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Tipo</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">E-mail</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">Cidade</th>
              <th className="px-4 py-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum fornecedor encontrado.</td></tr>
            ) : items.map((item: any) => (
              <tr key={item.fornecedorId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.nomeCompleto}</td>
                <td className="px-4 py-3 hidden md:table-cell"><Badge variant="secondary">{item.tipoPessoa}</Badge></td>
                <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">{item.email ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">{item.cidade ? `${item.cidade}/${item.uf ?? ''}` : '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleEdit(item)} className="text-gray-300 hover:text-green-600 transition-colors">
                    <Pencil size={14} />
                  </button>
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
              <h2 className="text-lg font-semibold text-gray-900">{editItem ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
              <button onClick={() => { setShowForm(false); setEditItem(null) }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo *</Label>
                  <select {...form.register('tipoPessoa')} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                    <option value="PJ">Pessoa Jurídica</option>
                    <option value="PF">Pessoa Física</option>
                  </select>
                </div>
                <div><Label>CNPJ / CPF</Label><Input {...form.register('cnpjCpf')} className="mt-1" /></div>
              </div>
              <div>
                <Label>Nome / Razão Social *</Label>
                <Input {...form.register('nomeCompleto')} className="mt-1" />
                {form.formState.errors.nomeCompleto && <p className="text-xs text-red-500 mt-1">{form.formState.errors.nomeCompleto.message}</p>}
              </div>
              <div><Label>Nome Fantasia</Label><Input {...form.register('nomeFantasia')} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>E-mail</Label><Input {...form.register('email')} type="email" className="mt-1" /></div>
                <div><Label>Celular</Label><Input {...form.register('celular')} className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Contato</Label><Input {...form.register('contato')} className="mt-1" /></div>
                <div><Label>Telefone</Label><Input {...form.register('telefone')} className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2"><Label>Cidade</Label><Input {...form.register('cidade')} className="mt-1" /></div>
                <div><Label>UF</Label><Input {...form.register('uf')} className="mt-1" maxLength={2} /></div>
              </div>
              <div>
                <Label>Observação</Label>
                <textarea {...form.register('observacao')} rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditItem(null) }}>Cancelar</Button>
                <Button type="submit" disabled={isPending}>{isPending ? 'Salvando...' : editItem ? 'Salvar alterações' : 'Salvar fornecedor'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}