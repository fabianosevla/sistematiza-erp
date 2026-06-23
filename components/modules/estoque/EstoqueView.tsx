'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Download, AlertTriangle, CheckCircle, Edit3, Warehouse, ClipboardCheck, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import LocaisTab from './LocaisTab'
import PerdasTab from './PerdasTab'
import ContagemTab from './ContagemTab'
import EntradaNfeTab from './EntradaNfeTab'

interface Props { tenantSlug: string }

type Aba = 'produtos' | 'insumos' | 'ajuste' | 'locais' | 'perdas' | 'contagem' | 'nfe'

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

function StatusIcon({ atual, min }: { atual: number; min: number }) {
  if (atual <= min * 0.5) return <AlertTriangle size={14} className="text-red-500" />
  if (atual <= min)       return <AlertTriangle size={14} className="text-amber-500" />
  return <CheckCircle size={14} className="text-green-500" />
}

export default function EstoqueView({ tenantSlug }: Props) {
  const qc = useQueryClient()
  const [aba, setAba]               = useState<Aba>('produtos')
  const [showModal, setShowModal]   = useState<'produto' | 'insumo' | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [qtdAdicionar, setQtdAdicionar]     = useState('')
  const [precoCusto, setPrecoCusto]         = useState('')
  const [editandoAjuste, setEditandoAjuste] = useState<{ id: number; valor: string } | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['estoque-produtos', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['estoque-insumos', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['estoque-ajuste', tenantSlug] })
  }

  const { data: configRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
    staleTime: 60000,
  })
  const config = configRaw?.data

  const { data: produtosRaw, isLoading: prodLoad } = useQuery({
    queryKey: ['estoque-produtos', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/estoque/produtos`)).json(),
  })

  const { data: insumosRaw, isLoading: insLoad } = useQuery({
    queryKey: ['estoque-insumos', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/estoque/insumos`)).json(),
  })

  const { data: ajusteRaw, isLoading: ajusteLoad } = useQuery({
    queryKey: ['estoque-ajuste', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/estoque/ajustar`)).json(),
    enabled: aba === 'ajuste',
  })

  const produtos = Array.isArray(produtosRaw?.data) ? produtosRaw.data : Array.isArray(produtosRaw) ? produtosRaw : []
  const insumos  = Array.isArray(insumosRaw?.data)  ? insumosRaw.data  : Array.isArray(insumosRaw)  ? insumosRaw  : []
  const ajuste   = Array.isArray(ajusteRaw?.data)   ? ajusteRaw.data   : Array.isArray(ajusteRaw)   ? ajusteRaw   : []

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
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }))
    a.download = `${nome}.csv`
    a.click()
  }

  const kpisProd = {
    total:    produtos.length,
    criticos: produtos.filter((p: any) => p.estoqueAtual <= p.estoqueMinimo).length,
  }
  const kpisIns = {
    total:    insumos.length,
    criticos: insumos.filter((i: any) => i.estoqueAtual <= i.estoqueMinimo).length,
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Estoque</h1>
          <p className="text-sm text-gray-400 mt-0.5">Produtos, insumos, locais, perdas, contagem e entrada via NF-e</p>
        </div>
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
      </div>

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
        <div className="flex gap-0 min-w-max">
          {ABAS_BASE.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a.key ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {a.label}
            </button>
          ))}
          {ABAS_AVANCADAS.filter(a => a.check).map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
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
      )}

      {aba === 'insumos' && (
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
      )}

      {aba === 'ajuste' && (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-700">
              Esta aba permite atualizar o estoque de produtos <strong>sem dar baixa nos insumos</strong>. Use apenas para correções e inventário.
            </p>
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
        </div>
      )}

      {aba === 'locais'   && <LocaisTab tenantSlug={tenantSlug} />}
      {aba === 'perdas'   && <PerdasTab tenantSlug={tenantSlug} />}
      {aba === 'contagem' && <ContagemTab tenantSlug={tenantSlug} />}
      {aba === 'nfe'      && <EntradaNfeTab tenantSlug={tenantSlug} />}

      {showModal === 'produto' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Adicionar Estoque de Produto</h2>
              <button onClick={() => setShowModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">Os insumos da ficha técnica serão debitados automaticamente proporcionalmente à quantidade adicionada.</p>
              </div>
              <div><Label>Quantidade a adicionar *</Label><Input type="number" min="1" value={qtdAdicionar} onChange={e => setQtdAdicionar(e.target.value)} className="mt-1" autoFocus /></div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowModal(null)}>Cancelar</Button>
                <Button onClick={() => adicionarProdMut.mutate()} disabled={!qtdAdicionar || adicionarProdMut.isPending}>
                  {adicionarProdMut.isPending ? 'Processando...' : 'Confirmar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal === 'insumo' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Adicionar Insumo</h2>
              <button onClick={() => setShowModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><Label>Quantidade *</Label><Input type="number" min="0" step="0.001" value={qtdAdicionar} onChange={e => setQtdAdicionar(e.target.value)} className="mt-1" autoFocus /></div>
              <div><Label>Preço de Custo (R$)</Label><Input type="number" min="0" step="0.01" value={precoCusto} onChange={e => setPrecoCusto(e.target.value)} className="mt-1" placeholder="0,00" /></div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowModal(null)}>Cancelar</Button>
                <Button onClick={() => adicionarInsMut.mutate()} disabled={!qtdAdicionar || adicionarInsMut.isPending}>
                  {adicionarInsMut.isPending ? 'Processando...' : 'Confirmar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}