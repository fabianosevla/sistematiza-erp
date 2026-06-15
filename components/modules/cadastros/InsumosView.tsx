'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Download, Trash2, TrendingUp, TrendingDown, DollarSign, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import { useDominio } from '@/hooks/useDominio'

interface Props { tenantSlug: string }

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('pt-BR') }

const MESES_NOME  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function FinanceiroView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const apiBase   = `/api/${tenantSlug}/financeiro`
  const now       = new Date()

  // ── Domínios configuráveis ──────────────────────────────────────────────
  const categorias  = useDominio(tenantSlug, 'categoria_despesa', [
    'Matéria Prima','Embalagem','Entrega / Frete','Funcionários',
    'Aluguel','Energia / Água','Marketing','Impostos','Outros',
  ])
  const periodos = useDominio(tenantSlug, 'periodo_recorrencia', ['Mensal','Semanal','Anual'])

  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())
  const [aba, setAba] = useState<'despesas'|'dre'|'gastos-fixos'|'demonstrativo'|'compras'>('despesas')
  const [anoDemo, setAnoDemo]     = useState(now.getFullYear())
  const [anoGastos, setAnoGastos] = useState(now.getFullYear())
  const [categoria, setCategoria] = useState('')
  const [showNova, setShowNova]   = useState(false)
  const [showNovaCompra, setShowNovaCompra] = useState(false)
  const [confirmDelete, setConfirmDelete]   = useState<{ id: number; nome: string } | null>(null)
  const [editandoCelula, setEditandoCelula] = useState<{ catId: number; mes: number } | null>(null)
  const [valorCelula, setValorCelula]       = useState('')

  const [nome, setNome]               = useState('')
  const [catNova, setCatNova]         = useState('')
  const [valor, setValor]             = useState('')
  const [dataDespesa, setDataDespesa] = useState(new Date().toISOString().slice(0, 10))
  const [recorrente, setRecorrente]   = useState(false)
  const [periodo, setPeriodo]         = useState('')

  const [cNomeInsumo, setCNomeInsumo]         = useState('')
  const [cNomeFornecedor, setCNomeFornecedor] = useState('')
  const [cDataEntrada, setCDataEntrada]       = useState(new Date().toISOString().slice(0, 10))
  const [cValorUnit, setCValorUnit]           = useState('')
  const [cQuantidade, setCQuantidade]         = useState('')
  const [cCaixas, setCCaixas]                 = useState('0')
  const [cStatus, setCStatus]                 = useState('pendente')

  function navMes(delta: number) {
    let novoMes = mes + delta; let novoAno = ano
    if (novoMes > 12) { novoMes = 1;  novoAno++ }
    if (novoMes < 1)  { novoMes = 12; novoAno-- }
    setMes(novoMes); setAno(novoAno)
  }

  const invalidate = (key: string) => qc.invalidateQueries({ queryKey: [key, tenantSlug] })
  const eMesAtual  = mes === now.getMonth() + 1 && ano === now.getFullYear()

  const { data: kpisData } = useQuery({
    queryKey: ['fin-kpis', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${apiBase}?tipo=kpis&mes=${mes}&ano=${ano}`)).json(),
  })

  const { data: despesasData, isLoading } = useQuery({
    queryKey: ['despesas', tenantSlug, mes, ano, categoria],
    queryFn:  async () => {
      const p = new URLSearchParams({ mes: String(mes), ano: String(ano) })
      if (categoria) p.set('categoria', categoria)
      return (await fetch(`${apiBase}?${p}`)).json()
    },
    enabled: aba === 'despesas',
  })

  const { data: dreData, isLoading: dreLoading } = useQuery({
    queryKey: ['dre', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${apiBase}?tipo=dre&mes=${mes}&ano=${ano}`)).json(),
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
        body: JSON.stringify({
          nome,
          categoria: catNova || categorias[0],
          valor: Math.round(parseFloat(valor.replace(',', '.')) * 100),
          dataDespesa, recorrente,
          periodoRecorrencia: recorrente ? (periodo || periodos[0]).toLowerCase() : undefined,
          mes, ano,
        }),
      })
      const d = await res.json(); if (!res.ok) throw new Error(d.message); return d
    },
    onSuccess: () => {
      invalidate('despesas'); invalidate('fin-kpis')
      setShowNova(false); setNome(''); setValor(''); toast('Despesa lançada!')
    },
    onError: () => toast('Erro ao lançar despesa.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${apiBase}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { invalidate('despesas'); invalidate('fin-kpis'); toast('Despesa excluída.') },
    onError:   () => toast('Erro ao excluir.', 'error'),
  })

  const salvarCelulaMut = useMutation({
    mutationFn: ({ categoriaId, mesC, valor }: any) => fetch(`${apiBase}/gastos-fixos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoriaId, ano: anoGastos, mes: mesC, valor: Math.round(parseFloat(valor.replace(',', '.') || '0') * 100) }),
    }).then(r => r.json()),
    onSuccess: () => { invalidate('gastos-fixos'); setEditandoCelula(null) },
  })

  const propagarAnualMut = useMutation({
    mutationFn: ({ categoriaId, valor }: any) => fetch(`${apiBase}/gastos-fixos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'propagarAnual', categoriaId, ano: anoGastos, valor }),
    }).then(r => r.json()),
    onSuccess: () => { invalidate('gastos-fixos'); toast('Valor propagado para o ano todo!') },
  })

  const criarCompraMut = useMutation({
    mutationFn: async () => fetch(`/api/${tenantSlug}/compras`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nomeInsumo: cNomeInsumo, nomeFornecedor: cNomeFornecedor, dataEntrada: cDataEntrada,
        valorUnitario: Math.round(parseFloat(cValorUnit.replace(',', '.')) * 100),
        quantidade: parseFloat(cQuantidade), caixas: Number(cCaixas),
        qtdTotal: parseFloat(cQuantidade), status: cStatus,
      }),
    }).then(r => r.json()),
    onSuccess: () => {
      invalidate('compras'); setShowNovaCompra(false)
      setCNomeInsumo(''); setCNomeFornecedor(''); setCValorUnit(''); setCQuantidade('')
      toast('Compra registrada!')
    },
    onError: () => toast('Erro ao registrar compra.', 'error'),
  })

  const pagarCompraMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/${tenantSlug}/compras/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataPagamento: new Date().toISOString().slice(0, 10) }),
    }).then(r => r.json()),
    onSuccess: () => { invalidate('compras'); toast('Compra marcada como paga!') },
  })

  const excluirCompraMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/${tenantSlug}/compras/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { invalidate('compras'); toast('Compra excluída.') },
  })

  function exportCSV() {
    const rows = despesas.map((d: any) => [d.despesaId, d.nome, d.categoria, (d.valor / 100).toFixed(2), fmtDate(d.dataDespesa)])
    const csv  = [['ID', 'Nome', 'Categoria', 'Valor', 'Data'], ...rows].map(r => r.map((c: unknown) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }))
    a.download = `despesas-${String(mes).padStart(2, '0')}-${ano}.csv`
    a.click()
  }

  const kpis    = kpisData?.data
  const despesas = Array.isArray(despesasData?.data) ? despesasData.data : []
  const dre      = dreData?.data ?? null
  const gastos   = gastosData?.data ?? null
  const demo     = Array.isArray(demoData?.data) ? demoData.data : []
  const compras  = Array.isArray(comprasData?.data) ? comprasData.data : Array.isArray(comprasData) ? comprasData : []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Financeiro</h1>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => navMes(-1)} className="p-0.5 text-gray-400 hover:text-gray-700"><ChevronLeft size={16} /></button>
            <span className="text-sm font-semibold text-gray-700 min-w-36 text-center">
              {MESES_NOME[mes - 1]} {ano}
              {eMesAtual && <span className="ml-2 text-xs font-normal text-green-600 bg-green-50 px-1.5 py-0.5 rounded">mês atual</span>}
            </span>
            <button onClick={() => navMes(1)} className="p-0.5 text-gray-400 hover:text-gray-700"><ChevronRight size={16} /></button>
            {!eMesAtual && <button onClick={() => { setMes(now.getMonth() + 1); setAno(now.getFullYear()) }} className="text-xs text-blue-600 hover:underline">Hoje</button>}
          </div>
        </div>
        <div className="flex gap-2">
          {aba === 'despesas' && (
            <>
              <Button variant="outline" onClick={exportCSV}><Download size={14} className="mr-1.5" /> CSV</Button>
              <Button onClick={() => { setNome(''); setValor(''); setCatNova(categorias[0] ?? ''); setPeriodo(periodos[0] ?? ''); setShowNova(true) }}>
                <Plus size={15} className="mr-1.5" /> Nova despesa
              </Button>
            </>
          )}
          {aba === 'compras' && (
            <Button onClick={() => { setCNomeInsumo(''); setCValorUnit(''); setCQuantidade(''); setShowNovaCompra(true) }}>
              <Plus size={15} className="mr-1.5" /> Nova compra
            </Button>
          )}
        </div>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Receita hoje',                             value: fmt(kpis.receitaHoje),  icon: TrendingUp,   color: 'text-green-500' },
            { label: `Receita ${MESES_ABREV[mes - 1]}/${ano}`,  value: fmt(kpis.receitaMes),   icon: TrendingUp,   color: 'text-green-500' },
            { label: `Despesas ${MESES_ABREV[mes - 1]}/${ano}`, value: fmt(kpis.despesasMes),  icon: TrendingDown, color: 'text-red-500' },
            { label: kpis.resultado >= 0 ? 'Resultado' : 'Prejuízo', value: fmt(Math.abs(kpis.resultado)), icon: DollarSign,
              color: kpis.resultado >= 0 ? 'text-green-600' : 'text-red-600',
              bg:    kpis.resultado >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200' },
          ].map((c, i) => (
            <div key={i} className={`rounded-xl border p-4 ${(c as any).bg ?? 'bg-white border-gray-100'}`}>
              <div className="flex items-center gap-2 mb-1"><c.icon size={14} className={c.color} /><p className="text-xs text-gray-400">{c.label}</p></div>
              <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

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

      {aba === 'despesas' && (
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <select value={categoria} onChange={e => setCategoria(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm bg-white focus:outline-none">
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="text-xs text-gray-400">Gerencie categorias em Cadastros → Domínios</p>
        </div>
      )}

      {aba === 'despesas' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Nome','Categoria','Data','Tipo','Valor',''].map((h, i) => (
                  <th key={i} className={`text-left text-xs font-medium text-gray-400 px-4 py-3 ${i === 4 ? 'text-right' : ''} ${i === 5 ? 'w-16' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Carregando {MESES_NOME[mes - 1]} {ano}...</td></tr>
              ) : despesas.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Nenhuma despesa em {MESES_NOME[mes - 1]} {ano}.</td></tr>
              ) : despesas.map((d: any) => (
                <tr key={d.despesaId} className="group border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{d.nome}</p>
                    {d.geradaAutomaticamente && <p className="text-xs text-blue-500">gerada automaticamente</p>}
                  </td>
                  <td className="px-4 py-3"><Badge variant="secondary">{d.categoria}</Badge></td>
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(d.dataDespesa)}</td>
                  <td className="px-4 py-3">
                    {d.recorrente ? <Badge variant="outline">{d.periodoRecorrencia ?? 'Recorrente'}</Badge> : <span className="text-xs text-gray-400">Avulsa</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">{fmt(d.valor)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setConfirmDelete({ id: d.despesaId, nome: d.nome })}
                      className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
              {dre.porCategoria && Object.keys(dre.porCategoria).length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-700">Por categoria</h3></div>
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-100">{['Categoria','Valor','% Desp','% Rec'].map((h,i) => <th key={i} className={`text-${i===0?'left':'right'} text-xs font-medium text-gray-400 px-4 py-3`}>{h}</th>)}</tr></thead>
                    <tbody>
                      {Object.entries(dre.porCategoria).sort(([,a],[,b]) => (b as number)-(a as number)).map(([cat, val]) => (
                        <tr key={cat} className="border-b border-gray-50 last:border-0">
                          <td className="px-4 py-3 text-sm text-gray-700">{cat}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-red-600">{fmt(val as number)}</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-400">{dre.totalDespesas > 0 ? (((val as number)/dre.totalDespesas)*100).toFixed(1) : 0}%</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-400">{dre.receita > 0 ? (((val as number)/dre.receita)*100).toFixed(1) : 0}%</td>
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

      {aba === 'gastos-fixos' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setAnoGastos(a => a - 1)} className="px-2 py-1 border rounded hover:bg-gray-50 text-sm">‹</button>
              <span className="text-lg font-semibold w-16 text-center">{anoGastos}</span>
              <button onClick={() => setAnoGastos(a => a + 1)} className="px-2 py-1 border rounded hover:bg-gray-50 text-sm">›</button>
            </div>
            <p className="text-xs text-gray-400">Clique em uma célula para editar · Clique no nome para propagar para o ano todo</p>
          </div>
          {gastos ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-48">Categoria</th>
                      {MESES_ABREV.map(m => <th key={m} className="text-right text-xs font-medium text-gray-400 px-2 py-3 w-20">{m}</th>)}
                      <th className="text-right text-xs font-medium text-gray-400 px-4 py-3 w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(gastos.categorias) && gastos.categorias.map((cat: any) => {
                      const totalCat = Array.from({ length: 12 }, (_, i) => gastos.grade?.[cat.categoriaId]?.[i + 1] ?? 0).reduce((a: number, b: number) => a + b, 0)
                      const valJan   = gastos.grade?.[cat.categoriaId]?.[1] ?? 0
                      return (
                        <tr key={cat.categoriaId} className="border-b border-gray-50 hover:bg-gray-50/30">
                          <td className="px-4 py-2 text-sm font-medium text-gray-900">
                            <span className={valJan > 0 ? 'cursor-pointer hover:text-blue-600 underline decoration-dotted' : ''}
                              onClick={() => { if (valJan > 0 && confirm(`Propagar ${fmt(valJan)} para todos os meses de ${anoGastos}?`)) propagarAnualMut.mutate({ categoriaId: cat.categoriaId, valor: valJan }) }}>
                              {cat.nome}
                            </span>
                          </td>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(mesC => {
                            const val       = gastos.grade?.[cat.categoriaId]?.[mesC] ?? 0
                            const isEditing = editandoCelula?.catId === cat.categoriaId && editandoCelula?.mes === mesC
                            const isMesAtual = mesC === mes && anoGastos === ano
                            return (
                              <td key={mesC} className={`px-2 py-2 text-right ${isMesAtual ? 'bg-green-50/40' : ''}`}>
                                {isEditing ? (
                                  <input type="number" min="0" step="0.01" value={valorCelula}
                                    onChange={e => setValorCelula(e.target.value)}
                                    onBlur={() => salvarCelulaMut.mutate({ categoriaId: cat.categoriaId, mesC, valor: valorCelula })}
                                    onKeyDown={e => { if (e.key === 'Enter') salvarCelulaMut.mutate({ categoriaId: cat.categoriaId, mesC, valor: valorCelula }); if (e.key === 'Escape') setEditandoCelula(null) }}
                                    className="w-20 h-6 text-right text-xs border border-green-400 rounded px-1 focus:outline-none" autoFocus />
                                ) : (
                                  <button onClick={() => { setEditandoCelula({ catId: cat.categoriaId, mes: mesC }); setValorCelula(val > 0 ? (val / 100).toFixed(2) : '') }}
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
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(mesC => {
                        const total = Array.isArray(gastos.categorias) ? gastos.categorias.reduce((a: number, cat: any) => a + (gastos.grade?.[cat.categoriaId]?.[mesC] ?? 0), 0) : 0
                        const isMesAtual = mesC === mes && anoGastos === ano
                        return <td key={mesC} className={`px-2 py-2 text-right text-xs font-semibold text-gray-700 ${isMesAtual ? 'bg-green-50/40' : ''}`}>{total > 0 ? fmt(total) : '—'}</td>
                      })}
                      <td className="px-4 py-2 text-right text-sm font-bold">
                        {fmt(Array.isArray(gastos.categorias) ? gastos.categorias.reduce((a: number, cat: any) => a + Array.from({ length: 12 }, (_, i) => gastos.grade?.[cat.categoriaId]?.[i + 1] ?? 0).reduce((x: number, y: number) => x + y, 0), 0) : 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : <div className="text-center py-12 text-sm text-gray-400">Carregando...</div>}
        </div>
      )}

      {aba === 'demonstrativo' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setAnoDemo(a => a - 1)} className="px-2 py-1 border rounded hover:bg-gray-50 text-sm">‹</button>
            <span className="text-lg font-semibold w-16 text-center">{anoDemo}</span>
            <button onClick={() => setAnoDemo(a => a + 1)} className="px-2 py-1 border rounded hover:bg-gray-50 text-sm">›</button>
          </div>
          {demoLoading ? <div className="text-center py-12 text-sm text-gray-400">Calculando...</div> : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-24">Mês</th>
                      {['Receita','Despesas','Gastos Fixos','Resultado','Margem'].map(h => <th key={h} className="text-right text-xs font-medium text-gray-400 px-4 py-3">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {demo.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Sem dados.</td></tr>
                    ) : demo.map((m: any) => {
                      const isMesAtual = m.mesNum === now.getMonth() + 1 && anoDemo === now.getFullYear()
                      return (
                        <tr key={m.mesNum}
                          className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50/50 ${m.resultado < 0 ? 'bg-red-50/20' : ''} ${isMesAtual ? 'ring-1 ring-inset ring-green-300' : ''}`}
                          onClick={() => { setMes(m.mesNum); setAno(anoDemo); setAba('despesas') }}>
                          <td className="px-4 py-2.5 text-sm font-semibold text-gray-700">{m.mes}{isMesAtual && <span className="ml-1 text-green-500">●</span>}</td>
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
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

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
                  <td className="px-4 py-3 text-center"><Badge variant={c.status === 'pago' ? 'default' : 'secondary'}>{c.status === 'pago' ? 'Pago' : 'Pendente'}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {c.status !== 'pago' && <button onClick={() => pagarCompraMut.mutate(c.compraId)} className="text-green-500 hover:text-green-700"><CheckCircle size={14} /></button>}
                      <button onClick={() => excluirCompraMut.mutate(c.compraId)} className="text-gray-300 hover:text-red-500"><X size={14} /></button>
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
              <div>
                <h2 className="text-lg font-semibold">Nova despesa</h2>
                <p className="text-xs text-gray-400 mt-0.5">Competência: {MESES_NOME[mes - 1]} {ano}</p>
              </div>
              <button onClick={() => setShowNova(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><Label>Nome *</Label><Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" autoFocus /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Categoria *</Label>
                  <select value={catNova} onChange={e => setCatNova(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">Gerencie em Cadastros → Domínios</p>
                </div>
                <div><Label>Data *</Label><Input type="date" value={dataDespesa} onChange={e => setDataDespesa(e.target.value)} className="mt-1" /></div>
              </div>
              <div><Label>Valor (R$) *</Label><Input type="number" min="0" step="0.01" value={valor} onChange={e => setValor(e.target.value)} className="mt-1" /></div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={recorrente} onChange={e => setRecorrente(e.target.checked)} className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-700">Recorrente — aparece automaticamente todo mês</span>
              </label>
              {recorrente && (
                <div>
                  <Label>Período</Label>
                  <select value={periodo} onChange={e => setPeriodo(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    {periodos.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">Gerencie em Cadastros → Domínios</p>
                </div>
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
              <div><Label>Fornecedor</Label><Input value={cNomeFornecedor} onChange={e => setCNomeFornecedor(e.target.value)} className="mt-1" /></div>
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

      {confirmDelete && (
        <ConfirmModal title="Excluir despesa"
          message={`Excluir "${confirmDelete.nome}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir" danger
          onConfirm={() => { excluirMut.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  )
}