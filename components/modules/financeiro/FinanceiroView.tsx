'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Download, Trash2, TrendingUp, TrendingDown, DollarSign, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface Props { tenantSlug: string }

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('pt-BR') }
function getMesAtual() {
  const now = new Date()
  return {
    inicio: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    fim:    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  }
}

const CATEGORIAS = ['Matéria Prima','Embalagem','Entrega / Frete','Funcionários','Aluguel','Energia / Água','Marketing','Impostos','Outros']
const MESES      = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function FinanceiroView({ tenantSlug }: Props) {
  const qc       = useQueryClient()
  const apiBase  = `/api/${tenantSlug}/financeiro`
  const mesAtual = getMesAtual()

  const [aba, setAba]               = useState<'despesas'|'dre'|'gastos-fixos'|'demonstrativo'|'compras'>('despesas')
  const [page, setPage]             = useState(1)
  const [dataInicio, setDataInicio] = useState(mesAtual.inicio)
  const [dataFim, setDataFim]       = useState(mesAtual.fim)
  const [categoria, setCategoria]   = useState('')
  const [showNova, setShowNova]     = useState(false)
  const [showNovaCompra, setShowNovaCompra] = useState(false)
  const [anoGastos, setAnoGastos]   = useState(new Date().getFullYear())
  const [anoDemo, setAnoDemo]       = useState(new Date().getFullYear())
  const [editandoCelula, setEditandoCelula] = useState<{ catId: number; mes: number } | null>(null)
  const [valorCelula, setValorCelula]       = useState('')

  // Form despesa
  const [nome, setNome]               = useState('')
  const [catNova, setCatNova]         = useState(CATEGORIAS[0])
  const [valor, setValor]             = useState('')
  const [dataDespesa, setDataDespesa] = useState(new Date().toISOString().slice(0, 10))
  const [recorrente, setRecorrente]   = useState(false)
  const [periodo, setPeriodo]         = useState('mensal')

  // Form compra
  const [cNomeInsumo, setCNomeInsumo]           = useState('')
  const [cNomeFornecedor, setCNomeFornecedor]   = useState('')
  const [cDataEntrada, setCDataEntrada]         = useState(new Date().toISOString().slice(0, 10))
  const [cValorUnit, setCValorUnit]             = useState('')
  const [cQuantidade, setCQuantidade]           = useState('')
  const [cCaixas, setCCaixas]                   = useState('0')
  const [cStatus, setCStatus]                   = useState('pendente')

  const invalidate = (key: string) => qc.invalidateQueries({ queryKey: [key, tenantSlug] })

  const { data: kpisData } = useQuery({
    queryKey: ['fin-kpis', tenantSlug],
    queryFn:  async () => (await fetch(`${apiBase}?tipo=kpis`)).json(),
    refetchInterval: 30000,
  })

  const { data: despesasData, isLoading } = useQuery({
    queryKey: ['despesas', tenantSlug, page, dataInicio, dataFim, categoria],
    queryFn:  async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' })
      if (dataInicio) p.set('dataInicio', dataInicio)
      if (dataFim)    p.set('dataFim', dataFim)
      if (categoria)  p.set('categoria', categoria)
      return (await fetch(`${apiBase}?${p}`)).json()
    },
  })

  const { data: dreData, isLoading: dreLoading } = useQuery({
    queryKey: ['dre', tenantSlug, dataInicio, dataFim],
    queryFn:  async () => (await fetch(`${apiBase}?tipo=dre&dataInicio=${dataInicio}&dataFim=${dataFim}`)).json(),
    enabled:  aba === 'dre',
  })

  const { data: gastosData } = useQuery({
    queryKey: ['gastos-fixos', tenantSlug, anoGastos],
    queryFn:  async () => (await fetch(`${apiBase}/gastos-fixos?ano=${anoGastos}`)).json(),
    enabled:  aba === 'gastos-fixos',
  })

  const { data: demoData, isLoading: demoLoading } = useQuery({
    queryKey: ['demonstrativo', tenantSlug, anoDemo],
    queryFn:  async () => (await fetch(`${apiBase}?tipo=demonstrativo&ano=${anoDemo}`)).json(),
    enabled:  aba === 'demonstrativo',
  })

  const { data: comprasData, isLoading: comprasLoading } = useQuery({
    queryKey: ['compras', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/compras`)).json(),
    enabled:  aba === 'compras',
  })

  const criarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiBase, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, categoria: catNova, valor: Math.round(parseFloat(valor.replace(',', '.')) * 100), dataDespesa, recorrente, periodoRecorrencia: recorrente ? periodo : undefined }),
      })
      const d = await res.json(); if (!res.ok) throw new Error(d.message); return d
    },
    onSuccess: () => { invalidate('despesas'); invalidate('fin-kpis'); setShowNova(false); setNome(''); setValor('') },
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${apiBase}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess:  () => { invalidate('despesas'); invalidate('fin-kpis') },
  })

  const salvarCelulaMut = useMutation({
    mutationFn: ({ categoriaId, mes, valor }: any) => fetch(`${apiBase}/gastos-fixos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoriaId, ano: anoGastos, mes, valor: Math.round(parseFloat(valor.replace(',', '.') || '0') * 100) }),
    }).then(r => r.json()),
    onSuccess: () => { invalidate('gastos-fixos'); setEditandoCelula(null) },
  })

  const criarCompraMut = useMutation({
    mutationFn: async () => fetch(`/api/${tenantSlug}/compras`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomeInsumo: cNomeInsumo, nomeFornecedor: cNomeFornecedor, dataEntrada: cDataEntrada, valorUnitario: Math.round(parseFloat(cValorUnit.replace(',', '.')) * 100), quantidade: parseFloat(cQuantidade), caixas: Number(cCaixas), qtdTotal: parseFloat(cQuantidade), status: cStatus }),
    }).then(r => r.json()),
    onSuccess: () => { invalidate('compras'); setShowNovaCompra(false); setCNomeInsumo(''); setCNomeFornecedor(''); setCValorUnit(''); setCQuantidade('') },
  })

  const pagarCompraMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/${tenantSlug}/compras/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataPagamento: new Date().toISOString().slice(0, 10) }),
    }).then(r => r.json()),
    onSuccess: () => invalidate('compras'),
  })

  const excluirCompraMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/${tenantSlug}/compras/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess:  () => invalidate('compras'),
  })

  function exportCSV() {
    const rows = despesas.map((d: any) => [d.despesaId, d.nome, d.categoria, (d.valor / 100).toFixed(2), fmtDate(d.dataDespesa)])
    const csv  = [['ID','Nome','Categoria','Valor','Data'], ...rows].map(r => r.map((c: unknown) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }))
    a.download = `despesas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const kpis    = kpisData?.data
  const despesas = despesasData?.data?.data ?? []
  const meta     = despesasData?.data?.meta
  const dre      = dreData?.data
  const gastos   = gastosData?.data
  const demo     = demoData ?? []
  const compras  = Array.isArray(comprasData?.data) ? comprasData.data : []

  const ATALHOS = [
    { label: 'Este mês', inicio: mesAtual.inicio, fim: mesAtual.fim },
    { label: 'Mês ant.', inicio: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10), fim: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0, 10) },
    { label: 'Este ano', inicio: `${new Date().getFullYear()}-01-01`, fim: `${new Date().getFullYear()}-12-31` },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-400 mt-0.5">Receitas, despesas e resultado</p>
        </div>
        {aba === 'despesas' && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCSV}><Download size={14} className="mr-1.5" /> CSV</Button>
            <Button onClick={() => { setNome(''); setValor(''); setShowNova(true) }}>
              <Plus size={15} className="mr-1.5" /> Nova despesa
            </Button>
          </div>
        )}
        {aba === 'compras' && (
          <Button onClick={() => { setCNomeInsumo(''); setCValorUnit(''); setCQuantidade(''); setShowNovaCompra(true) }}>
            <Plus size={15} className="mr-1.5" /> Nova compra
          </Button>
        )}
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Receita hoje',   value: fmt(kpis.receitaHoje), icon: TrendingUp,   color: 'text-green-500' },
            { label: 'Receita do mês', value: fmt(kpis.receitaMes),  icon: TrendingUp,   color: 'text-green-500' },
            { label: 'Despesas mês',   value: fmt(kpis.despesasMes), icon: TrendingDown, color: 'text-red-500' },
            {
              label: kpis.resultado >= 0 ? 'Lucro' : 'Prejuízo',
              value: fmt(Math.abs(kpis.resultado)),
              icon: DollarSign,
              color: kpis.resultado >= 0 ? 'text-green-600' : 'text-red-600',
              bg:    kpis.resultado >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200',
            },
          ].map((c, i) => (
            <div key={i} className={`rounded-xl border p-4 ${(c as any).bg ?? 'bg-white border-gray-100'}`}>
              <div className="flex items-center gap-2 mb-1">
                <c.icon size={14} className={c.color} />
                <p className="text-xs text-gray-400">{c.label}</p>
              </div>
              <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Abas */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
        {([
          { value: 'despesas',      label: 'Despesas' },
          { value: 'dre',           label: 'DRE' },
          { value: 'gastos-fixos',  label: 'Gastos Fixos' },
          { value: 'demonstrativo', label: 'Demonstrativo' },
          { value: 'compras',       label: 'Rel. Compras' },
        ] as const).map(a => (
          <button key={a.value} onClick={() => setAba(a.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${aba === a.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {a.label}
          </button>
        ))}
      </div>

      {/* Filtros período */}
      {(aba === 'despesas' || aba === 'dre') && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2"><Label className="text-xs">De:</Label><Input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setPage(1) }} className="h-9 text-sm w-36" /></div>
          <div className="flex items-center gap-2"><Label className="text-xs">Até:</Label><Input type="date" value={dataFim}    onChange={e => { setDataFim(e.target.value);    setPage(1) }} className="h-9 text-sm w-36" /></div>
          {aba === 'despesas' && (
            <select value={categoria} onChange={e => { setCategoria(e.target.value); setPage(1) }}
              className="h-9 rounded-lg border border-gray-200 px-3 text-sm bg-white focus:outline-none">
              <option value="">Todas</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <div className="flex gap-1">
            {ATALHOS.map(a => (
              <button key={a.label} onClick={() => { setDataInicio(a.inicio); setDataFim(a.fim); setPage(1) }}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">{a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Despesas */}
      {aba === 'despesas' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Nome','Categoria','Data','Recorrente','Valor',''].map((h, i) => (
                  <th key={i} className={`text-left text-xs font-medium text-gray-400 px-4 py-3 ${i >= 2 ? 'hidden lg:table-cell' : ''} ${i === 4 ? 'text-right' : ''} ${i === 5 ? 'w-16' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
              ) : despesas.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Nenhuma despesa encontrada.</td></tr>
              ) : despesas.map((d: any) => (
                <tr key={d.despesaId} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3"><p className="text-sm font-medium text-gray-900">{d.nome}</p></td>
                  <td className="px-4 py-3"><Badge variant="secondary">{d.categoria}</Badge></td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">{fmtDate(d.dataDespesa)}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">{d.recorrente && <Badge variant="outline">{d.periodoRecorrencia}</Badge>}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">{fmt(d.valor)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => { if (confirm(`Excluir "${d.nome}"?`)) excluirMut.mutate(d.despesaId) }} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
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
      )}

      {/* DRE */}
      {aba === 'dre' && (
        <div className="space-y-4">
          {dreLoading ? <div className="text-center py-12 text-sm text-gray-400">Calculando...</div> : dre ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-green-600 font-medium">Receita</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">{fmt(dre.receita)}</p>
                  <p className="text-xs text-green-500 mt-0.5">{dre.qtdVendas} vendas</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-red-600 font-medium">Despesas</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">{fmt(dre.totalDespesas)}</p>
                </div>
                <div className={`rounded-xl border p-4 text-center ${dre.resultado >= 0 ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                  <p className={`text-xs font-medium ${dre.resultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>{dre.resultado >= 0 ? 'Lucro' : 'Prejuízo'}</p>
                  <p className={`text-2xl font-bold mt-1 ${dre.resultado >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(Math.abs(dre.resultado))}</p>
                  {dre.receita > 0 && <p className="text-xs mt-0.5" style={{ color: dre.resultado >= 0 ? '#15803d' : '#dc2626' }}>Margem: {((dre.resultado / dre.receita) * 100).toFixed(1)}%</p>}
                </div>
              </div>
              {Object.keys(dre.porCategoria).length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-700">Por categoria</h3></div>
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100">{['Categoria','Valor','% Desp','% Rec'].map((h, i) => <th key={i} className={`text-${i === 0 ? 'left' : 'right'} text-xs font-medium text-gray-400 px-4 py-3`}>{h}</th>)}</tr></thead>
                    <tbody>
                      {Object.entries(dre.porCategoria).sort(([, a], [, b]) => (b as number) - (a as number)).map(([cat, val]) => (
                        <tr key={cat} className="border-b border-gray-50 last:border-0">
                          <td className="px-4 py-3 text-sm text-gray-700">{cat}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-red-600">{fmt(val as number)}</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-400">{dre.totalDespesas > 0 ? (((val as number) / dre.totalDespesas) * 100).toFixed(1) : 0}%</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-400">{dre.receita > 0 ? (((val as number) / dre.receita) * 100).toFixed(1) : 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* Gastos Fixos */}
      {aba === 'gastos-fixos' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setAnoGastos(a => a - 1)} className="px-2 py-1 border rounded hover:bg-gray-50 text-sm">‹</button>
              <span className="text-lg font-semibold w-16 text-center">{anoGastos}</span>
              <button onClick={() => setAnoGastos(a => a + 1)} className="px-2 py-1 border rounded hover:bg-gray-50 text-sm">›</button>
            </div>
            <p className="text-sm text-gray-400">Clique em uma célula para editar</p>
          </div>
          {gastos ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-48">Categoria</th>
                      {MESES.map(m => <th key={m} className="text-right text-xs font-medium text-gray-400 px-2 py-3 w-20">{m}</th>)}
                      <th className="text-right text-xs font-medium text-gray-400 px-4 py-3 w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.categorias.map((cat: any) => {
                      const totalCat = Array.from({ length: 12 }, (_, i) => gastos.grade[cat.categoriaId]?.[i + 1] ?? 0).reduce((a: number, b: number) => a + b, 0)
                      return (
                        <tr key={cat.categoriaId} className="border-b border-gray-50 hover:bg-gray-50/30">
                          <td className="px-4 py-2 text-sm font-medium text-gray-900">{cat.nome}</td>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(mes => {
                            const val = gastos.grade[cat.categoriaId]?.[mes] ?? 0
                            const isEditing = editandoCelula?.catId === cat.categoriaId && editandoCelula?.mes === mes
                            return (
                              <td key={mes} className="px-2 py-2 text-right">
                                {isEditing ? (
                                  <input type="number" min="0" step="0.01" value={valorCelula}
                                    onChange={e => setValorCelula(e.target.value)}
                                    onBlur={() => salvarCelulaMut.mutate({ categoriaId: cat.categoriaId, mes, valor: valorCelula })}
                                    onKeyDown={e => { if (e.key === 'Enter') salvarCelulaMut.mutate({ categoriaId: cat.categoriaId, mes, valor: valorCelula }); if (e.key === 'Escape') setEditandoCelula(null) }}
                                    className="w-20 h-6 text-right text-xs border border-green-400 rounded px-1 focus:outline-none" autoFocus />
                                ) : (
                                  <button onClick={() => { setEditandoCelula({ catId: cat.categoriaId, mes }); setValorCelula(val > 0 ? (val / 100).toFixed(2) : '') }}
                                    className={`w-20 h-6 text-right text-xs px-1 rounded hover:bg-green-50 ${val > 0 ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>
                                    {val > 0 ? fmt(val) : '—'}
                                  </button>
                                )}
                              </td>
                            )
                          })}
                          <td className="px-4 py-2 text-right text-sm font-semibold">{totalCat > 0 ? fmt(totalCat) : '—'}</td>
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-4 py-2 text-sm font-bold text-gray-700">Total mensal</td>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(mes => {
                        const total = gastos.categorias.reduce((a: number, cat: any) => a + (gastos.grade[cat.categoriaId]?.[mes] ?? 0), 0)
                        return <td key={mes} className="px-2 py-2 text-right text-xs font-semibold text-gray-700">{total > 0 ? fmt(total) : '—'}</td>
                      })}
                      <td className="px-4 py-2 text-right text-sm font-bold">
                        {fmt(gastos.categorias.reduce((a: number, cat: any) => a + Array.from({ length: 12 }, (_, i) => gastos.grade[cat.categoriaId]?.[i + 1] ?? 0).reduce((x: number, y: number) => x + y, 0), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : <div className="text-center py-12 text-sm text-gray-400">Carregando...</div>}
        </div>
      )}

      {/* Demonstrativo */}
      {aba === 'demonstrativo' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setAnoDemo(a => a - 1)} className="px-2 py-1 border rounded hover:bg-gray-50 text-sm">‹</button>
              <span className="text-lg font-semibold w-16 text-center">{anoDemo}</span>
              <button onClick={() => setAnoDemo(a => a + 1)} className="px-2 py-1 border rounded hover:bg-gray-50 text-sm">›</button>
            </div>
          </div>
          {demoLoading ? <div className="text-center py-12 text-sm text-gray-400">Calculando...</div> : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-24">Mês</th>
                      {['Receita','Despesas','Gastos Fixos','Resultado','Margem'].map(h => (
                        <th key={h} className="text-right text-xs font-medium text-gray-400 px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(demo as any[]).map((m: any) => (
                      <tr key={m.mesNum} className={`border-b border-gray-50 ${m.resultado < 0 ? 'bg-red-50/20' : ''}`}>
                        <td className="px-4 py-2.5 text-sm font-semibold text-gray-700">{m.mes}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-green-600 font-medium">{m.receita > 0 ? fmt(m.receita) : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-red-500">{m.despesas > 0 ? fmt(m.despesas) : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-orange-500">{m.fixos > 0 ? fmt(m.fixos) : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-sm font-semibold">
                          <span className={m.resultado >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {m.receita > 0 || m.despesas > 0 || m.fixos > 0 ? fmt(m.resultado) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm text-gray-400">{m.receita > 0 ? `${m.margem}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rel. Compras */}
      {aba === 'compras' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Insumo','Fornecedor','Entrada','Valor Unit.','Qtd','Status',''].map((h, i) => (
                  <th key={i} className={`text-${i === 0 ? 'left' : 'center'} text-xs font-medium text-gray-400 px-4 py-3`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comprasLoading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
              ) : compras.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Nenhuma compra registrada.</td></tr>
              ) : compras.map((c: any) => (
                <tr key={c.compraId} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.nomeInsumo}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500">{c.nomeFornecedor ?? '—'}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500">{fmtDate(c.dataEntrada)}</td>
                  <td className="px-4 py-3 text-center text-sm font-medium">{fmt(c.valorUnitario)}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-600">{parseFloat(String(c.quantidade)).toFixed(3)}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={c.status === 'pago' ? 'default' : 'secondary'}>{c.status === 'pago' ? 'Pago' : 'Pendente'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {c.status !== 'pago' && (
                        <button onClick={() => pagarCompraMut.mutate(c.compraId)} title="Marcar como pago" className="text-green-500 hover:text-green-700"><CheckCircle size={14} /></button>
                      )}
                      <button onClick={() => { if (confirm('Excluir?')) excluirCompraMut.mutate(c.compraId) }} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Nova Despesa */}
      {showNova && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Nova despesa</h2>
              <button onClick={() => setShowNova(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><Label>Nome *</Label><Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" autoFocus /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Categoria *</Label>
                  <select value={catNova} onChange={e => setCatNova(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><Label>Data *</Label><Input type="date" value={dataDespesa} onChange={e => setDataDespesa(e.target.value)} className="mt-1" /></div>
              </div>
              <div><Label>Valor (R$) *</Label><Input type="number" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)} className="mt-1" /></div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={recorrente} onChange={e => setRecorrente(e.target.checked)} className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-700">Recorrente</span>
              </label>
              {recorrente && (
                <select value={periodo} onChange={e => setPeriodo(e.target.value)} className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  <option value="mensal">Mensal</option>
                  <option value="semanal">Semanal</option>
                  <option value="anual">Anual</option>
                </select>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowNova(false)}>Cancelar</Button>
                <Button onClick={() => criarMut.mutate()} disabled={!nome || !valor || criarMut.isPending}>
                  {criarMut.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Compra */}
      {showNovaCompra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Registrar Compra</h2>
              <button onClick={() => setShowNovaCompra(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><Label>Insumo *</Label><Input value={cNomeInsumo} onChange={e => setCNomeInsumo(e.target.value)} className="mt-1" autoFocus placeholder="Nome do insumo" /></div>
              <div><Label>Fornecedor</Label><Input value={cNomeFornecedor} onChange={e => setCNomeFornecedor(e.target.value)} className="mt-1" placeholder="Nome do fornecedor" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data Entrada *</Label><Input type="date" value={cDataEntrada} onChange={e => setCDataEntrada(e.target.value)} className="mt-1" /></div>
                <div>
                  <Label>Status</Label>
                  <select value={cStatus} onChange={e => setCStatus(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    <option value="pendente">Pendente</option>
                    <option value="pago">Pago</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Valor Unit. (R$)</Label><Input type="number" min="0" step="0.01" value={cValorUnit} onChange={e => setCValorUnit(e.target.value)} className="mt-1" /></div>
                <div><Label>Quantidade</Label><Input type="number" min="0" step="0.001" value={cQuantidade} onChange={e => setCQuantidade(e.target.value)} className="mt-1" /></div>
                <div><Label>Caixas</Label><Input type="number" min="0" value={cCaixas} onChange={e => setCCaixas(e.target.value)} className="mt-1" /></div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowNovaCompra(false)}>Cancelar</Button>
                <Button onClick={() => criarCompraMut.mutate()} disabled={!cNomeInsumo || criarCompraMut.isPending}>
                  {criarCompraMut.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}