'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Upload, Clock, Trash2, Eye, EyeOff } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { clienteInsertSchema, clienteNovoSchema, type ClienteInsertInput } from '@/lib/validations/cadastros'
import ImportacaoModal from '@/components/modules/importacao/ImportacaoModal'
import { HistoricoModal } from '@/components/ui/HistoricoModal'
import { AuditoriaInfo } from '@/components/ui/AuditoriaInfo'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { FormModal } from '@/components/ui/FormModal'
import { Aviso } from '@/components/ui/Aviso'
import { InfoTip } from '@/components/ui/InfoTip'
import { TIPOS_PRECO } from '@/lib/constants'

interface Props { tenantSlug: string }

export default function ClientesView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(1)
  const [limit, setLimit]             = useState(20)
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
    queryKey: ['clientes', tenantSlug, page, limit, search, incluirInativos],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
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

  // Cadastro novo exige telefone ou celular; edição não — assim um cliente
  // antigo sem telefone continua podendo ser corrigido e salvo.
  const form = useForm<ClienteInsertInput>({
    resolver: zodResolver(editItem ? clienteInsertSchema : clienteNovoSchema),
  })

  function handleNew() {
    form.reset({ tipoPessoa: 'PF', tabelaPreco: 'varejo', indicadorIe: '9' }); setEditItem(null); setFormError(''); setShowForm(true)
  }

  function handleEdit(item: any) {
    setEditItem(item); setFormError('')
    form.reset({
      tipoPessoa: item.tipoPessoa, nomeCompleto: item.nomeCompleto, nomeFantasia: item.nomeFantasia,
      documento: item.documento, email: item.email, telefone: item.telefone, celular: item.celular,
      cep: item.cep, endereco: item.endereco, numero: item.numero, complemento: item.complemento,
      bairro: item.bairro, cidade: item.cidade, uf: item.uf, observacao: item.observacao,
      tabelaPreco: item.tabelaPreco ?? 'varejo',
      inscricaoEstadual: item.inscricaoEstadual ?? '',
      indicadorIe: item.indicadorIe ?? '9',
    })
    setShowForm(true)
  }

  function fecharForm() {
    setShowForm(false); setEditItem(null); setFormError('')
  }

  function onSubmit(data: ClienteInsertInput) {
    if (editItem) {
      updateMutation.mutate({ id: editItem.clienteId, payload: { ...data, modificationNum: editItem.modificationNum } })
      return
    }
    // Guarda explícita além do schema: o resolver do react-hook-form é
    // definido na montagem do formulário, e não quero depender disso para
    // uma regra que protege dado em produção.
    const temContato = (data.telefone ?? '').trim() || (data.celular ?? '').trim()
    if (!temContato) {
      form.setError('telefone', { type: 'manual', message: 'Informe telefone ou celular' })
      return
    }
    createMutation.mutate(data)
  }

  const clientes  = data?.data?.data ?? []
  const meta      = data?.data?.meta
  const isPending = createMutation.isPending || updateMutation.isPending

  const colunas: Coluna[] = [
    {
      // Mostra o nome fantasia quando existe — é como o cliente é conhecido no
      // dia a dia. A razão social fica embaixo, menor, porque ainda é
      // necessária para nota fiscal e conferência de cadastro.
      chave: 'nomeCompleto', titulo: 'Nome', principal: true,
      render: (c: any) => {
        const fantasia = (c.nomeFantasia ?? '').trim()
        const razao    = (c.nomeCompleto ?? '').trim()
        const usaFantasia = fantasia.length > 0 && fantasia !== razao
        return (
          <div className="min-w-0">
            <span className="flex items-center gap-2">
              {usaFantasia ? fantasia : razao}
              {c.activeFlag === false && <Badge variant="outline" className="text-gray-400">Inativo</Badge>}
            </span>
            {usaFantasia && (
              <span className="block text-xs text-gray-400 truncate">{razao}</span>
            )}
          </div>
        )
      },
    },
    {
      chave: 'tipoPessoa', titulo: 'Tipo', esconderAte: 'md',
      render: (c: any) => <Badge variant={c.tipoPessoa === 'PJ' ? 'secondary' : 'outline'}>{c.tipoPessoa}</Badge>,
    },
    { chave: 'email', titulo: 'E-mail', esconderAte: 'lg', render: (c: any) => c.email ?? '—' },
    {
      chave: 'tabelaPreco', titulo: 'Tabela', esconderAte: 'md', alinhamento: 'center',
      // Todo cliente tem tabela — quem não escolheu está em varejo. Mostrar
      // travessão dava a impressão de campo vazio. Varejo usa o estilo neutro
      // e atacado o de destaque, então dá para separar os dois de relance.
      render: (c: any) => {
        const tabela = c.tabelaPreco || 'varejo'
        return (
          <Badge variant={tabela === 'varejo' ? 'outline' : 'secondary'}>
            {(TIPOS_PRECO as any)[tabela] ?? tabela}
          </Badge>
        )
      },
    },
    {
      chave: 'cidade', titulo: 'Cidade', esconderAte: 'lg',
      render: (c: any) => c.cidade ? `${c.cidade}/${c.uf ?? ''}` : '—',
    },
  ]

  return (
    <div>
      <PageHeader
        titulo="Clientes"
        acoes={
          <>
            <Button variant="outline" onClick={() => { setIncluirInativos(v => !v); setPage(1) }}>
              {incluirInativos ? <Eye size={14} className="mr-1.5" /> : <EyeOff size={14} className="mr-1.5" />}
              {incluirInativos ? 'Vendo inativos' : 'Ver inativos'}
            </Button>
            <Button variant="outline" onClick={() => setShowImport(true)}><Upload size={14} className="mr-1.5" /> Importar</Button>
            <Button onClick={handleNew}><Plus size={15} className="mr-1.5" /> Novo cliente</Button>
          </>
        }
      />

      {flash && <Aviso tom="sucesso" className="mb-4">{flash}</Aviso>}

      {showImport && (
        <ImportacaoModal tenantSlug={tenantSlug} entidade="clientes" queryKey="clientes" onClose={() => setShowImport(false)} />
      )}

      <SearchInput
        valor={search}
        onChange={v => { setSearch(v); setPage(1) }}
        placeholder="Buscar por nome, fantasia ou CPF/CNPJ..."
      />

      <DataTable
        colunas={colunas}
        itens={clientes}
        chave={(c: any) => c.clienteId}
        carregando={isLoading}
        vazio="Nenhum cliente encontrado."
        meta={meta}
        onPageChange={setPage}
        onLimitChange={setLimit}
        classeLinha={(c: any) => c.activeFlag === false ? 'opacity-60' : ''}
        acoes={(c: any) => (
          <>
            <BotaoIcone titulo="Histórico" variante="destaque" onClick={() => setShowHistorico(c)}>
              <Clock size={14} />
            </BotaoIcone>
            <BotaoIcone titulo="Editar" onClick={() => handleEdit(c)}>
              <Pencil size={14} />
            </BotaoIcone>
            <BotaoIcone titulo="Excluir" variante="perigo" onClick={() => setConfirmDelete(c)}>
              <Trash2 size={14} />
            </BotaoIcone>
          </>
        )}
      />

      {showForm && (
        <FormModal
          titulo={editItem ? 'Editar cliente' : 'Novo cliente'}
          onClose={fecharForm}
          largura="max-w-2xl"
        >
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4">
            {formError && <Aviso tom="erro">{formError}</Aviso>}
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

            {/* Tabela de preço — define qual coluna de preço do produto vale
                para este cliente no PDV e nas vendas. Um campo aqui evita um
                campo em Pedido, PDV e Venda. */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="inline-flex items-center gap-1">
                  Tabela de preço
                  <InfoTip titulo="Tabela de preço">
                    Define qual preço do produto é usado para este cliente: o de varejo
                    ou uma das cinco faixas de atacado. O PDV aplica sozinho ao selecionar
                    o cliente na venda.
                  </InfoTip>
                </Label>
                <select {...form.register('tabelaPreco')}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                  {Object.entries(TIPOS_PRECO).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>Nome completo / Razão social *</Label>
              <Input {...form.register('nomeCompleto')} className="mt-1" />
              {form.formState.errors.nomeCompleto && <p className="text-xs text-red-500 mt-1">{form.formState.errors.nomeCompleto.message}</p>}
            </div>
            <div><Label>Nome fantasia</Label><Input {...form.register('nomeFantasia')} className="mt-1" /></div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>E-mail</Label>
                <Input {...form.register('email')} type="email" className="mt-1" />
                {form.formState.errors.email && <p className="text-xs text-red-500 mt-1">{form.formState.errors.email.message}</p>}
              </div>
              <div>
                <Label>Celular{!editItem && ' *'}</Label>
                <Input {...form.register('celular')} className="mt-1" placeholder="(35) 99999-9999" />
              </div>
              <div>
                <Label className="inline-flex items-center gap-1">
                  Telefone{!editItem && ' *'}
                  {!editItem && (
                    <InfoTip titulo="Contato obrigatório">
                      Cliente novo precisa de celular ou telefone. Só um dos dois basta.
                    </InfoTip>
                  )}
                </Label>
                <Input {...form.register('telefone')} className="mt-1" placeholder="(35) 3333-3333" />
                {form.formState.errors.telefone && <p className="text-xs text-red-500 mt-1">{form.formState.errors.telefone.message}</p>}
              </div>
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

            {/* FISCAL.
                A NF-e precisa saber se quem compra é contribuinte de ICMS.
                As colunas existiam e nada as preenchia: toda nota saía com o
                cliente como não contribuinte, inclusive empresa comprando
                para revenda. */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="inline-flex items-center gap-1">
                  Indicador de IE
                  <InfoTip titulo="Indicador de inscrição estadual">
                    Contribuinte é quem compra para revender e tem IE ativa; consumidor comum é não contribuinte.
                  </InfoTip>
                </Label>
                <select {...form.register('indicadorIe')}
                  className="mt-1 w-full h-8 rounded-lg border border-gray-200 px-2 text-sm focus:outline-none focus:border-green-400">
                  <option value="9">Não contribuinte</option>
                  <option value="1">Contribuinte de ICMS</option>
                  <option value="2">Contribuinte isento</option>
                </select>
              </div>
              <div className="col-span-2">
                <Label>Inscrição estadual</Label>
                <Input {...form.register('inscricaoEstadual')} className="mt-1" placeholder="Somente números" />
              </div>
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
              <Button type="submit" disabled={isPending}>{isPending ? 'Salvando...' : editItem ? 'Salvar alterações' : 'Salvar cliente'}</Button>
            </div>
          </form>
        </FormModal>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Excluir cliente"
          message={`Excluir "${(confirmDelete.nomeFantasia ?? '').trim() || confirmDelete.nomeCompleto}"? Se ele tiver vendas associadas, será apenas inativado (histórico preservado).`}
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
          titulo={(showHistorico.nomeFantasia ?? '').trim() || showHistorico.nomeCompleto}
          onClose={() => setShowHistorico(null)}
        />
      )}
    </div>
  )
}