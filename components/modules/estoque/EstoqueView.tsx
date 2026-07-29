'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Paginacao from '@/components/ui/Paginacao'
import { Plus, Download, AlertTriangle, CheckCircle, Edit3, Warehouse, ClipboardCheck, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { FormModal } from '@/components/ui/FormModal'
import LocaisTab from './LocaisTab'
import PerdasTab from './PerdasTab'
import ContagemTab from './ContagemTab'
import EntradaNfeTab from './EntradaNfeTab'
import { fmtMoeda as fmt } from '@/lib/format'

interface Props { tenantSlug: string }

type Aba = 'produtos' | 'insumos' | 'ajuste' | 'locais' | 'perdas' | 'contagem' | 'nfe'

function StatusIcon({ atual, min }: { atual: number; min: number }) {
  if (atual <= min * 0.5) return <AlertTriangle size={14} className="text-red-500" />
  if (atual <= min)       return <AlertTriangle size={14} className="text-amber-500" />
  return <CheckCircle size={14} className="text-green-500" />
}

export default function EstoqueView({ tenantSlug }: Props) {
  const qc = useQueryClient()
  const [aba, setAba]               = useState<Aba>('produtos')
  const [buscaInsumo, setBuscaInsumo] = useState('')
  const [buscaProduto, setBuscaProduto] = useState('')
  const [buscaAjuste, setBuscaAjuste]   = useState('')
  const [page, setPage]               = useState(1)
  const [limit, setLimit]             = useState(20)
  const [showModal, setShowModal]   = useState<'produto' | 'insumo' | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [qtdAdicionar, setQtdAdicionar]     = useState('')
  const [precoCusto, setPrecoCusto]         = useState('')
  const [editandoAjuste, setEditandoAjuste] = useState<{ id: number; valor: string } | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['estoque-produtos', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['estoque-insumos', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['estoque-ajuste', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['estoque-kpis', tenantSlug] })
  }

  const { data: configRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
    staleTime: 60000,
  })
  const config = configRaw?.data

  // KPIs contam TODOS os registros (não só a página atual).
  const { data: kpisRaw } = useQuery({
    queryKey: ['estoque-kpis', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/estoque/kpis`)).json(),
    staleTime: 15000,
  })
  const kpis = kpisRaw?.data

  const { data: produtosRaw, isLoading: prodLoad } = useQuery({
    queryKey: ['estoque-produtos', tenantSlug, page, limit, buscaProduto],
    queryFn:  async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (buscaProduto) params.set('search', buscaProduto)
      return (await fetch(`/api/${tenantSlug}/estoque/produtos?${params}`)).json()
    },
  })

  const { data: insumosRaw, isLoading: insLoad } = useQuery({
    queryKey: ['estoque-insumos', tenantSlug, page, limit, buscaInsumo],
    queryFn:  async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (buscaInsumo) params.set('search', buscaInsumo)
      return (await fetch(`/api/${tenantSlug}/estoque/insumos?${params}`)).json()
    },
  })

  const { data: ajusteRaw, isLoading: ajusteLoad } = useQuery({
    queryKey: ['estoque-ajuste', tenantSlug, page, limit, buscaAjuste],
    queryFn:  async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (buscaAjuste) params.set('search', buscaAjuste)
      return (await fetch(`/api/${tenantSlug}/estoque/ajustar?${params}`)).json()
    },
    enabled: aba === 'ajuste',
  })

  const produtos = Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data : Array.isArray(produtosRaw?.data) ? produtosRaw.data : Array.isArray(produtosRaw) ? produtosRaw : []
  const insumos  = Array.isArray(insumosRaw?.data?.data)  ? insumosRaw.data.data  : Array.isArray(insumosRaw?.data)  ? insumosRaw.data  : Array.isArray(insumosRaw)  ? insumosRaw  : []
  const ajuste   = Array.isArray(ajusteRaw?.data?.data)   ? ajusteRaw.data.data   : Array.isArray(ajusteRaw?.data)   ? ajusteRaw.data   : Array.isArray(ajusteRaw)   ? ajusteRaw   : []

  // CORRIGIDO: campos trocados — schema da rota espera "entidade" e "tipo",
  // não "tipo" para entidade e "tipoMovimento" para o tipo de operação.
  const adicionarProdMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/estoque/movimentar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entidade:   'produto',
          entidadeId: selectedId,
          quantidade: Number(qtdAdicionar),
          tipo:       'entrada',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao movimentar estoque')
      return data
    },
    onSuccess: () => { invalidate(); setShowModal(null); setQtdAdicionar('') },
  })

  const adicionarInsMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/estoque/movimentar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entidade:   'insumo',
          entidadeId: selectedId,
          quantidade: Number(qtdAdicionar),
          tipo:       'entrada',
          precoCusto: precoCusto ? Math.round(parseFloat(precoCusto.replace(',', '.')) * 100) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao movimentar estoque')
      return data
    },
    onSuccess: () => { invalidate(); setShowModal(null); setQtdAdicionar(''); setPrecoCusto('') },
  })

  const ajustarMut = useMutation({
    mutationFn: ({ produtoId, novoEstoque }: any) => fetch(`/api/${tenantSlug}/estoque/ajustar`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produtoId, novoEstoque: Number(novoEstoque) }),
    }).then(r => r.json()),
    onSuccess: () => { invalidate(); setEditandoAjuste(null) },
  })

  function exportCSV(dados: any[], nome: string) {
    const csv = [
      ['ID', 'Nome', 'Estoque Atual', 'Estoque Mínimo'],
      ...dados.map((d: any) => [d.produtoId ?? d.insumoId, d.nome, d.estoqueAtual, d.estoqueMinimo]),
    ].map(r => r.map((c: any) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    a.download = `${nome}.csv`
    a.click()
  }

  // Usa os totais do endpoint de KPIs (conta tudo). Cai pro page-based só até carregar.
  const kpisProd = {
    total:    kpis?.produtos          ?? produtos.length,
    criticos: kpis?.produtosCriticos  ?? produtos.filter((p: any) => p.estoqueAtual <= p.estoqueMinimo).length,
  }
  const kpisIns = {
    total:    kpis?.insumos           ?? insumos.length,
    criticos: kpis?.insumosCriticos   ?? insumos.filter((i: any) => i.estoqueAtual <= i.estoqueMinimo).length,
  }

  const ABAS_BASE: { key: Aba; label: string }[] = [
    { key: 'produtos', label: 'Produto Acabado' },
    { key: 'insumos',  label: 'Insumos' },
    { key: 'ajuste',   label: 'Ajuste Sem Baixa' },
  ]
  const ABAS_AVANCADAS: { key: Aba; label: string; icon: any; check: boolean }[] = [
    { key: 'locais',   label: 'Locais',       icon: Warehouse,       check: !!config?.multiplosLocaisAtivo },
    { key: 'perdas',   label: 'Perdas',       icon: AlertTriangle,   check: !!config?.perdaProdutoAtivo },
    { key: 'contagem', label: 'Contagem',     icon: ClipboardCheck,  check: !!config?.contagemInventarioAtivo },
    { key: 'nfe',      label: 'Entrada NF-e', icon: FileSpreadsheet, check: !!config?.entradaNfeAtivo },
  ]

  const mostrarKpisBase = aba === 'produtos' || aba === 'insumos' || aba === 'ajuste'

  function trocarAba(nova: Aba) {
    setAba(nova); setPage(1); setBuscaInsumo(''); setBuscaProduto(''); setBuscaAjuste('')
  }

  return (
    <div>
      <PageHeader
        titulo="Estoque"
        acoes={
          <>
            {aba === 'produtos' && produtos.length > 0 && (
              <Button variant="outline" onClick={() => exportCSV(produtos, 'estoque-produtos')}>
                <Download size={14} className="mr-1.5" /> CSV
              </Button>
            )}
            {aba === 'insumos' && insumos.length > 0 && (
              <Button variant="outline" onClick={() => exportCSV(insumos, 'estoque-insumos')}>
                <Download size={14} className="mr-1.5" /> CSV
              </Button>
            )}
          </>
        }
      />

      {mostrarKpisBase && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Produtos',          value: String(kpisProd.total),    color: '' },
            { label: 'Produtos críticos', value: String(kpisProd.criticos), color: kpisProd.criticos > 0 ? 'text-red-600' : 'text-green-600', bg: kpisProd.criticos > 0 ? 'bg-red-50 border-red-200' : '' },
            { label: 'Insumos',           value: String(kpisIns.total),     color: '' },
            { label: 'Insumos críticos',  value: String(kpisIns.criticos),  color: kpisIns.criticos > 0 ? 'text-red-600' : 'text-green-600', bg: kpisIns.criticos > 0 ? 'bg-red-50 border-red-200' : '' },
          ].map((kpi, i) => (
            <div key={i} className={`rounded-xl border p-4 ${kpi.bg ?? 'bg-white border-gray-100'}`}>
              <p className="text-xs text-gray-400">{kpi.label}</p>
              <p className={`text-2xl font-bold mt-1 ${kpi.color || 'text-gray-900'}`}>{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="border-b border-gray-100 mb-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max items-center">
          {ABAS_BASE.map(a => (
            <button key={a.key} onClick={() => trocarAba(a.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a.key ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {a.label}
            </button>
          ))}
          {ABAS_AVANCADAS.filter(a => a.check).map(a => (
            <button key={a.key} onClick={() => trocarAba(a.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a.key ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <a.icon size={14} />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'produtos' && (
        <>
        <SearchInput valor={buscaProduto} onChange={v => { setBuscaProduto(v); setPage(1) }}
          placeholder="Buscar produto..." className="mb-4 max-w-xs" />
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['', 'Produto', 'Est. Atual', 'Est. Mínimo', 'Unidade', ''].map((h, i) => (
                  <th key={i} className={`text-${i <= 1 ? 'left' : 'center'} text-xs font-medium text-gray-400 px-4 py-3 ${i === 0 ? 'w-10' : ''} ${i === 5 ? 'w-24' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prodLoad ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
              ) : produtos.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum produto cadastrado.</td></tr>
              ) : produtos.map((p: any) => (
                <tr key={p.produtoId} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-center"><StatusIcon atual={p.estoqueAtual} min={p.estoqueMinimo} /></td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.nome}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-center">{p.estoqueAtual}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-center">{p.estoqueMinimo}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-center">{p.unidade ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => { setSelectedId(p.produtoId); setShowModal('produto') }}
                      className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1 mx-auto">
                      <Plus size={12} /> Adicionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacao page={page} totalPages={produtosRaw?.data?.meta?.totalPages ?? 1} total={produtosRaw?.data?.meta?.total ?? 0} limit={limit} onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1) }} />
        </>
      )}

      {aba === 'insumos' && (
        <>
        <SearchInput valor={buscaInsumo} onChange={v => { setBuscaInsumo(v); setPage(1) }}
          placeholder="Buscar insumo..." className="mb-4 max-w-xs" />
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['', 'Insumo', 'Est. Atual', 'Est. Mínimo', 'Unidade', 'Preço Custo', ''].map((h, i) => (
                  <th key={i} className={`text-${i <= 1 ? 'left' : 'center'} text-xs font-medium text-gray-400 px-4 py-3`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {insLoad ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
              ) : insumos.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum insumo cadastrado.</td></tr>
              ) : insumos.map((ins: any) => (
                <tr key={ins.insumoId} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-center"><StatusIcon atual={ins.estoqueAtual} min={ins.estoqueMinimo} /></td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{ins.nome}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-center">{ins.estoqueAtual}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-center">{ins.estoqueMinimo}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-center">{ins.unidade ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-center">{ins.precoCusto ? fmt(ins.precoCusto) : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => { setSelectedId(ins.insumoId); setShowModal('insumo') }}
                      className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1 mx-auto">
                      <Plus size={12} /> Adicionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacao page={page} totalPages={insumosRaw?.data?.meta?.totalPages ?? 1} total={insumosRaw?.data?.meta?.total ?? 0} limit={limit} onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1) }} />
        </>
      )}

      {aba === 'ajuste' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <SearchInput valor={buscaAjuste} onChange={v => { setBuscaAjuste(v); setPage(1) }}
              placeholder="Buscar produto..." className="max-w-xs flex-1" />
            <InfoTip titulo="Ajuste sem baixa">
              Atualiza o estoque do produto <strong>sem debitar os insumos</strong> da ficha técnica.
              Use apenas para correção de inventário — para produção, use o módulo Produção.
            </InfoTip>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Produto', 'Estoque Atual', 'Novo Estoque', ''].map((h, i) => (
                    <th key={i} className={`text-${i === 0 ? 'left' : 'center'} text-xs font-medium text-gray-400 px-4 py-3`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ajusteLoad ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
                ) : ajuste.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum produto encontrado.</td></tr>
                ) : ajuste.map((p: any) => (
                  <tr key={p.produtoId} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.nome}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-semibold ${p.estoqueAtual <= p.estoqueMinimo ? 'text-red-600' : 'text-green-600'}`}>{p.estoqueAtual}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editandoAjuste?.id === p.produtoId ? (
                        <input type="number" min="0"
                          value={editandoAjuste?.valor ?? ''}
                          onChange={e => setEditandoAjuste({ id: p.produtoId, valor: e.target.value })}
                          onBlur={() => ajustarMut.mutate({ produtoId: p.produtoId, novoEstoque: editandoAjuste?.valor ?? '0' })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') ajustarMut.mutate({ produtoId: p.produtoId, novoEstoque: editandoAjuste?.valor ?? '0' })
                            if (e.key === 'Escape') setEditandoAjuste(null)
                          }}
                          className="w-20 h-7 text-center text-sm border border-green-400 rounded focus:outline-none" autoFocus />
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setEditandoAjuste({ id: p.produtoId, valor: String(p.estoqueAtual) })}
                        className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 mx-auto">
                        <Edit3 size={12} /> Ajustar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacao page={page} totalPages={ajusteRaw?.data?.meta?.totalPages ?? 1} total={ajusteRaw?.data?.meta?.total ?? 0} limit={limit} onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1) }} />
        </div>
      )}

      {aba === 'locais'   && <LocaisTab tenantSlug={tenantSlug} />}
      {aba === 'perdas'   && <PerdasTab tenantSlug={tenantSlug} />}
      {aba === 'contagem' && <ContagemTab tenantSlug={tenantSlug} />}
      {aba === 'nfe'      && <EntradaNfeTab tenantSlug={tenantSlug} />}

      {showModal === 'produto' && (
        <FormModal
          titulo="Adicionar Estoque de Produto"
          onClose={() => setShowModal(null)}
          largura="max-w-sm"
          cabecalho={
            <InfoTip titulo="Efeito no estoque">
              Os insumos da ficha técnica são debitados automaticamente, proporcionalmente
              à quantidade adicionada.
            </InfoTip>
          }
        >
          <div className="p-6 space-y-4">
            <div><Label>Quantidade a adicionar *</Label><Input type="number" min="1" value={qtdAdicionar} onChange={e => setQtdAdicionar(e.target.value)} className="mt-1" autoFocus /></div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowModal(null)}>Cancelar</Button>
              <Button onClick={() => adicionarProdMut.mutate()} disabled={!qtdAdicionar || adicionarProdMut.isPending}>
                {adicionarProdMut.isPending ? 'Processando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </FormModal>
      )}

      {showModal === 'insumo' && (
        <FormModal titulo="Adicionar Insumo" onClose={() => setShowModal(null)} largura="max-w-sm">
          <div className="p-6 space-y-4">
            <div><Label>Quantidade *</Label><Input type="number" min="0" step="0.001" value={qtdAdicionar} onChange={e => setQtdAdicionar(e.target.value)} className="mt-1" autoFocus /></div>
            <div>
              <Label className="inline-flex items-center gap-1">
                Preço de Custo (R$)
                <InfoTip titulo="Preço de custo">
                  Se informado, atualiza o custo do insumo no cadastro — o que muda o custo
                  calculado das fichas técnicas que o utilizam.
                </InfoTip>
              </Label>
              <Input type="number" min="0" step="0.01" value={precoCusto} onChange={e => setPrecoCusto(e.target.value)} className="mt-1" placeholder="0,00" />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowModal(null)}>Cancelar</Button>
              <Button onClick={() => adicionarInsMut.mutate()} disabled={!qtdAdicionar || adicionarInsMut.isPending}>
                {adicionarInsMut.isPending ? 'Processando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </FormModal>
      )}
    </div>
  )
}