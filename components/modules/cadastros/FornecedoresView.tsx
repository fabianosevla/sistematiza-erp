'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Upload, Clock, Trash2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { fornecedorInsertSchema, type FornecedorInsertInput } from '@/lib/validations/cadastros'
import ImportacaoModal from '@/components/modules/importacao/ImportacaoModal'
import { HistoricoModal } from '@/components/ui/HistoricoModal'
import { AuditoriaInfo } from '@/components/ui/AuditoriaInfo'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { FormModal } from '@/components/ui/FormModal'

interface Props { tenantSlug: string }

export default function FornecedoresView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const { toast }   = useToast()
  const [search, setSearch]             = useState('')
  const [page, setPage]                 = useState(1)
  const [showForm, setShowForm]         = useState(false)
  const [showImport, setShowImport]     = useState(false)
  const [showHistorico, setShowHistorico] = useState<any>(null)
  const [editItem, setEditItem]         = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; nome: string } | null>(null)
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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json()
      // Sem esse check, um 400 "Registro já existente" caía em onSuccess e fechava o form.
      if (!res.ok) throw new Error(json?.message ?? 'Erro ao salvar fornecedor')
      return json
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fornecedores', tenantSlug] }); setShowForm(false) },
    onError: (e: any) => toast(e?.message ?? 'Erro ao salvar.', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const res = await fetch(`${apiBase}/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message ?? 'Erro ao salvar fornecedor')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fornecedores', tenantSlug] })
      setShowForm(false); setEditItem(null)
    },
    onError: (e: any) => toast(e?.message ?? 'Erro ao salvar.', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' })
      const d   = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao excluir')
      return d
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fornecedores', tenantSlug] }); toast('Fornecedor excluído.') },
    onError:   (e: any) => toast(e.message || 'Erro ao excluir.', 'error'),
  })

  const form = useForm<FornecedorInsertInput>({ resolver: zodResolver(fornecedorInsertSchema) })

  function handleNew() {
    form.reset({ tipoPessoa: 'PJ' }); setEditItem(null); setShowForm(true)
  }

  function handleEdit(item: any) {
    setEditItem(item)
    form.reset({
      tipoPessoa: item.tipoPessoa, nomeCompleto: item.nomeCompleto, nomeFantasia: item.nomeFantasia,
      cnpjCpf: item.cnpjCpf, email: item.email, telefone: item.telefone, celular: item.celular,
      contato: item.contato, cep: item.cep, endereco: item.endereco, numero: item.numero,
      complemento: item.complemento, bairro: item.bairro, cidade: item.cidade, uf: item.uf,
      observacao: item.observacao,
    })
    setShowForm(true)
  }

  function fecharForm() {
    setShowForm(false); setEditItem(null)
  }

  function onSubmit(data: FornecedorInsertInput) {
    if (editItem) {
      updateMutation.mutate({ id: editItem.fornecedorId, payload: { ...data, modificationNum: editItem.modificationNum } })
    } else {
      createMutation.mutate(data)
    }
  }

  const items     = data?.data?.data ?? []
  const meta      = data?.data?.meta
  const isPending = createMutation.isPending || updateMutation.isPending

  // Colunas da listagem — mesma ordem e mesma responsividade de antes
  const colunas: Coluna[] = [
    { chave: 'nomeCompleto', titulo: 'Nome', principal: true },
    {
      chave: 'tipoPessoa', titulo: 'Tipo', esconderAte: 'md',
      render: (item: any) => <Badge variant="secondary">{item.tipoPessoa}</Badge>,
    },
    {
      chave: 'email', titulo: 'E-mail', esconderAte: 'lg',
      render: (item: any) => item.email ?? '—',
    },
    {
      chave: 'cidade', titulo: 'Cidade', esconderAte: 'lg',
      render: (item: any) => item.cidade ? `${item.cidade}/${item.uf ?? ''}` : '—',
    },
  ]

  return (
    <div>
      <PageHeader
        titulo="Fornecedores"
        subtitulo={meta ? `${meta.total} registro${meta.total !== 1 ? 's' : ''}` : ''}
        acoes={
          <>
            <Button variant="outline" onClick={() => setShowImport(true)}><Upload size={14} className="mr-1.5" /> Importar</Button>
            <Button onClick={handleNew}><Plus size={15} className="mr-1.5" /> Novo fornecedor</Button>
          </>
        }
      />

      {showImport && (
        <ImportacaoModal tenantSlug={tenantSlug} entidade="fornecedores" queryKey="fornecedores" onClose={() => setShowImport(false)} />
      )}

      <SearchInput
        valor={search}
        onChange={v => { setSearch(v); setPage(1) }}
        placeholder="Buscar fornecedores..."
      />

      <DataTable
        colunas={colunas}
        itens={items}
        chave={(item: any) => item.fornecedorId}
        carregando={isLoading}
        vazio="Nenhum fornecedor encontrado."
        meta={meta}
        onPageChange={setPage}
        acoes={(item: any) => (
          <>
            <BotaoIcone titulo="Histórico" variante="destaque" onClick={() => setShowHistorico(item)}>
              <Clock size={14} />
            </BotaoIcone>
            <BotaoIcone titulo="Editar" onClick={() => handleEdit(item)}>
              <Pencil size={14} />
            </BotaoIcone>
            <BotaoIcone titulo="Excluir" variante="perigo" onClick={() => setConfirmDelete({ id: item.fornecedorId, nome: item.nomeCompleto })}>
              <Trash2 size={14} />
            </BotaoIcone>
          </>
        )}
      />

      {showForm && (
        <FormModal
          titulo={editItem ? 'Editar fornecedor' : 'Novo fornecedor'}
          onClose={fecharForm}
          largura="max-w-2xl"
        >
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
              <Button type="button" variant="outline" onClick={fecharForm}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Salvando...' : editItem ? 'Salvar alterações' : 'Salvar fornecedor'}</Button>
            </div>
          </form>
        </FormModal>
      )}

      {showHistorico && (
        <HistoricoModal
          tenantSlug={tenantSlug}
          entidade="fornecedor"
          entidadeId={showHistorico.fornecedorId}
          titulo={showHistorico.nomeCompleto}
          onClose={() => setShowHistorico(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Excluir fornecedor"
          message={`Excluir "${confirmDelete.nome}"? Ele deixará de aparecer nos cadastros e nas seleções de compra.`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => { deleteMutation.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}