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
import { insumoInsertSchema, type InsumoInsertInput } from '@/lib/validations/cadastros'

interface Props { tenantSlug: string }

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function InsumosView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const apiBase = `/api/${tenantSlug}/cadastros/insumos`

  const { data, isLoading } = useQuery({
    queryKey: ['insumos', tenantSlug, page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.set('search', search)
      const res = await fetch(`${apiBase}?${params}`)
      return res.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: InsumoInsertInput) => {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insumos', tenantSlug] })
      setShowForm(false)
    },
  })

  const form = useForm<InsumoInsertInput>({
    resolver: zodResolver(insumoInsertSchema),
    defaultValues: { unidade: 'kg', tipo: 'MP', estoqueAtual: 0, estoqueMinimo: 0, precoCusto: 0 },
  })

  function onSubmit(data: InsumoInsertInput) { createMutation.mutate(data) }

  const items = data?.data?.data ?? []
  const meta  = data?.data?.meta

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Insumos</h1>
          <p className="text-sm text-gray-400 mt-0.5">{meta ? `${meta.total} registro${meta.total !== 1 ? 's' : ''}` : ''}</p>
        </div>
        <Button onClick={() => { form.reset({ unidade: 'kg', tipo: 'MP' }); setShowForm(true) }}>
          <Plus size={15} className="mr-1.5" /> Novo insumo
        </Button>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Buscar insumos..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-9" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Nome</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Tipo</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Unidade</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">Estoque</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">Custo</th>
              <th className="px-4 py-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum insumo encontrado.</td></tr>
            ) : items.map((item: any) => (
              <tr key={item.insumoId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.nome}</td>
                <td className="px-4 py-3 hidden md:table-cell"><Badge variant={item.tipo === 'MP' ? 'default' : 'secondary'}>{item.tipo}</Badge></td>
                <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{item.unidade}</td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className={`text-sm font-medium ${item.estoqueAtual <= item.estoqueMinimo ? 'text-red-500' : 'text-gray-900'}`}>{item.estoqueAtual}</span>
                  <span className="text-xs text-gray-400 ml-1">/ mín {item.estoqueMinimo}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 hidden lg:table-cell">{formatCents(item.precoCusto)}</td>
                <td className="px-4 py-3"><button className="text-gray-300 hover:text-gray-600"><Pencil size={14} /></button></td>
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
              <h2 className="text-lg font-semibold text-gray-900">Novo insumo</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input {...form.register('nome')} className="mt-1" />
                {form.formState.errors.nome && <p className="text-xs text-red-500 mt-1">{form.formState.errors.nome.message}</p>}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2"><Label>Código de barras</Label><Input {...form.register('codigoBarras')} className="mt-1 font-mono" /></div>
                <div>
                  <Label>Tipo</Label>
                  <select {...form.register('tipo')} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                    <option value="MP">Matéria Prima</option>
                    <option value="EMB">Embalagem</option>
                    <option value="OUT">Outros</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Unidade</Label>
                  <select {...form.register('unidade')} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                    {['kg', 'g', 'L', 'ml', 'un', 'cx', 'm', 'pc'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div><Label>Estoque atual</Label><Input {...form.register('estoqueAtual', { valueAsNumber: true })} type="number" className="mt-1" /></div>
                <div><Label>Estoque mínimo</Label><Input {...form.register('estoqueMinimo', { valueAsNumber: true })} type="number" className="mt-1" /></div>
              </div>
              <div><Label>Custo unitário (R$)</Label><Input {...form.register('precoCusto', { valueAsNumber: true })} type="number" step="0.01" className="mt-1" placeholder="0,00" /></div>
              <div>
                <Label>Descrição</Label>
                <textarea {...form.register('descricao')} rows={2} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Salvando...' : 'Salvar insumo'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}