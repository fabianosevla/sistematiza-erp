'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, Plus, X, Trash2, Pencil } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Button }       from '@/components/ui/button'
import { Input }        from '@/components/ui/input'
import { Label }        from '@/components/ui/label'
import { useToast }     from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import ContasPagarView   from './ContasPagarView'
import ContasReceberView from './ContasReceberView'
import ConciliacaoView   from './ConciliacaoView'

interface Props { tenantSlug: string }

type Aba = 'despesas' | 'dre' | 'gastos-fixos' | 'demonstrativo' | 'a-pagar' | 'a-receber' | 'conciliacao'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CORES  = ['#2ecc71','#3498db','#e74c3c','#f39c12','#9b59b6','#1abc9c']
const fmt    = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (n: number) => `${n.toFixed(1)}%`

const CATEGORIAS_DESPESA = [
  'Aluguel', 'Água e Luz', 'Internet', 'Telefone', 'Funcionários',
  'Matéria-prima', 'Embalagens', 'Marketing', 'Transporte', 'Manutenção', 'Outros',
]

export default function FinanceiroView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/financeiro`
  const apiGastos = `/api/${tenantSlug}/financeiro/gastos-fixos`

  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())
  const [aba, setAba] = useState<Aba>('despesas')

  // ── Form Despesa ────────────────────────────────────────────────────────
  const [showDespesa, setShowDespesa] = useState(false)
  const [editDespesa, setEditDespesa] = useState<any>(null)
  const [confirmDel, setConfirmDel]   = useState<any>(null)
  const [despForm, setDespForm] = useState({
    nome: '', valor: '', categoria: CATEGORIAS_DESPESA[0],
    dataDespesa: new Date().toISOString().slice(0, 10),
    recorrente: false,
  })
  const setDF = (k: string, v: any) => setDespForm(p => ({ ...p, [k]: v }))

  // ── Config ──────────────────────────────────────────────────────────────
  const { data: configRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
    staleTime: 60000,
  })
  const config = configRaw?.data

  // ── Queries ─────────────────────────────────────────────────────────────
  const { data: kpisRaw } = useQuery({
    queryKey: ['fin-kpis', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?tipo=kpis&mes=${mes}&ano=${ano}`)).json(),
    refetchInterval: 60000,
  })

  const { data: despesasRaw, isLoading: loadDespesas } = useQuery({
    queryKey: ['fin-despesas', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?mes=${mes}&ano=${ano}`)).json(),
    enabled:  aba === 'despesas',
  })

  const { data: dreRaw } = useQuery({
    queryKey: ['fin-dre', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?tipo=dre&mes=${mes}&ano=${ano}`)).json(),
    enabled:  aba === 'dre',
  })

  const { data: gastosRaw } = useQuery({
    queryKey: ['fin-gastos', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${apiGastos}?mes=${mes}&ano=${ano}`)).json(),
    enabled:  aba === 'gastos-fixos',
  })

  const { data: demoRaw } = useQuery({
    queryKey: ['fin-demo', tenantSlug, ano],
    queryFn:  async () => (await fetch(`${api}?tipo=demonstrativo&ano=${ano}`)).json(),
    enabled:  aba === 'demonstrativo',
  })

  // ── Invalidate ──────────────────────────────────────────────────────────
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['fin-kpis',     tenantSlug] })
    qc.invalidateQueries({ queryKey: ['fin-despesas', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['fin-dre',      tenantSlug] })
    qc.invalidateQueries({ queryKey: ['fin-demo',     tenantSlug] })
  }

  // ── Mutations Despesa ────────────────────────────────────────────────────
  const salvarDespMut = useMutation({
    mutationFn: async () => {
      const url    = editDespesa ? `${api}/${editDespesa.despesaId}` : api
      const method = editDespesa ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome:       despForm.nome,
          categoria:  despForm.categoria,
          valor:      Math.round(parseFloat(despForm.valor.replace(',', '.') || '0') * 100),
          dataDespesa: despForm.dataDespesa,
          recorrente: despForm.recorrente,
          mes, ano,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: () => {
      inv()
      setShowDespesa(false)
      setEditDespesa(null)
      setDespForm({ nome: '', valor: '', categoria: CATEGORIAS_DESPESA[0], dataDespesa: new Date().toISOString().slice(0, 10), recorrente: false })
      toast(editDespesa ? 'Despesa atualizada!' : 'Despesa lançada!')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  const excluirDespMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao excluir')
      return d
    },
    onSuccess: () => { inv(); toast('Despesa excluída.') },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  // ── Mutation Gastos Fixos ────────────────────────────────────────────────
  const [showGasto, setShowGasto] = useState(false)
  const [gastoForm, setGastoForm] = useState({ categoria: '', valor: '', mes: String(now.getMonth() + 1), ano: String(now.getFullYear()) })
  const setGF = (k: string, v: string) => setGastoForm(p => ({ ...p, [k]: v }))

  const salvarGastoMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiGastos, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoria: gastoForm.categoria,
          valor:     Math.round(parseFloat(gastoForm.valor.replace(',', '.') || '0') * 100),
          mes:       parseInt(gastoForm.mes),
          ano:       parseInt(gastoForm.ano),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin-gastos', tenantSlug] })
      setShowGasto(false)
      setGastoForm({ categoria: '', valor: '', mes: String(mes), ano: String(ano) })
      toast('Gasto fixo salvo!')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  // ── Dados derivados ──────────────────────────────────────────────────────
  const kpis     = kpisRaw?.data
  const despesas = Array.isArray(despesasRaw?.data) ? despesasRaw.data : []
  const dre      = dreRaw?.data
  const gastos   = Array.isArray(gastosRaw?.data) ? gastosRaw.data : []
  // demonstrativo retorna array de meses diretamente
  const demo     = Array.isArray(demoRaw?.data) ? demoRaw.data : []

  function navMes(delta: number) {
    setMes(prev => {
      const n = prev + delta
      if (n > 12) { setAno(a => a + 1); return 1 }
      if (n < 1)  { setAno(a => a - 1); return 12 }
      return n
    })
  }

  function exportCSV(data: any[], prefix: string) {
    if (!data.length) return
    const keys = Object.keys(data[0])
    const csv  = [keys.join(','), ...data.map(r => keys.map(k => `"${(r as any)[k] ?? ''}"`).join(','))].join('\n')
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }))
    a.download = `${prefix}-${ano}-${String(mes).padStart(2, '0')}.csv`
    a.click()
  }

  const ABAS_BASE: { key: Aba; label: string }[] = [
    { key: 'despesas',      label: 'Despesas'      },
    { key: 'dre',           label: 'DRE'           },
    { key: 'gastos-fixos',  label: 'Gastos Fixos'  },
    { key: 'demonstrativo', label: 'Demonstrativo' },
  ]
  const ABAS_FIN: { key: Aba; label: string; check: boolean }[] = [
    { key: 'a-pagar',     label: 'A Pagar',     check: !!config?.contasPagarAtivo },
    { key: 'a-receber',   label: 'A Receber',   check: !!config?.contasReceberAtivo },
    { key: 'conciliacao', label: 'Conciliação', check: !!config?.conciliacaoBancariaAtivo },
  ]

  // KPIs calculados do DRE
  const receitaMes  = kpis?.receitaMes  ?? 0
  const despesasMes = kpis?.despesasMes ?? 0
  const resultado   = kpis?.resultado   ?? 0
  const margemPct   = receitaMes > 0 ? (resultado / receitaMes) * 100 : 0

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-400 mt-0.5">Controle financeiro completo</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navMes(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[110px] text-center">
            {MESES[mes - 1]} {ano}
          </span>
          <button onClick={() => navMes(1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Receita',   value: fmt(receitaMes),  color: 'text-green-600' },
          { label: 'Despesas',  value: fmt(despesasMes), color: 'text-red-600'   },
          { label: 'Resultado', value: fmt(resultado),   color: resultado >= 0 ? 'text-green-600' : 'text-red-600' },
          { label: 'Margem',    value: fmtPct(margemPct), color: 'text-blue-600' },
        ].map((k, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">{k.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
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
          {ABAS_FIN.filter(a => a.check).map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a.key ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ABA: DESPESAS */}
      {aba === 'despesas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{despesas.length} lançamento(s)</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportCSV(despesas, 'despesas')}>
                <Download size={13} className="mr-1" /> CSV
              </Button>
              <Button size="sm" onClick={() => { setEditDespesa(null); setDespForm({ nome: '', valor: '', categoria: CATEGORIAS_DESPESA[0], dataDespesa: new Date().toISOString().slice(0, 10), recorrente: false }); setShowDespesa(true) }}>
                <Plus size={13} className="mr-1" /> Nova despesa
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Nome', 'Categoria', 'Data', 'Recorrente', 'Valor', ''].map((h, i) => (
                    <th key={i} className={`text-left text-xs font-medium text-gray-400 px-4 py-3 ${i === 4 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadDespesas ? (
                  <tr><td colSpan={6} className="text-center py-8 text-sm text-gray-400">Carregando...</td></tr>
                ) : despesas.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-sm text-gray-400">Nenhuma despesa neste período.</td></tr>
                ) : despesas.map((d: any) => (
                  <tr key={d.despesaId ?? d.despesa_id} className="group border-b border-gray-50 hover:bg-gray-50/80">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.nome ?? d.descricao}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{d.categoria || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {d.data_despesa || d.dataDespesa ? new Date((d.data_despesa || d.dataDespesa) + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{d.recorrente ? '✓' : '—'}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">{fmt(d.valor)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 justify-end">
                        <button onClick={() => {
                          setEditDespesa(d)
                          setDespForm({
                            nome: d.nome ?? d.descricao ?? '',
                            valor: (d.valor / 100).toFixed(2),
                            categoria: d.categoria ?? '',
                            dataDespesa: (d.data_despesa || d.dataDespesa)?.slice(0, 10) ?? '',
                            recorrente: d.recorrente ?? false,
                          })
                          setShowDespesa(true)
                        }} className="p-1 text-blue-400 hover:text-blue-600">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmDel(d)} className="p-1 text-gray-300 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {despesas.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-gray-600">Total</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-red-600">
                      {fmt(despesas.reduce((a: number, d: any) => a + (d.valor ?? 0), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ABA: DRE */}
      {aba === 'dre' && (
        <div className="space-y-4">
          {!dre ? (
            <p className="text-sm text-gray-400 text-center py-12">Carregando DRE...</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">DRE — {MESES[mes - 1]}/{ano}</h3>
                <div className="space-y-3">
                  {[
                    { label: '(+) Receita Bruta',   value: dre.receita      ?? 0, color: 'text-green-600' },
                    { label: '(=) Receita Líquida',  value: dre.receita      ?? 0, color: 'text-green-700', bold: true },
                    { label: '(-) Total Despesas',   value: -(dre.totalDespesas ?? 0), color: 'text-red-500' },
                    { label: '(=) Resultado',        value: dre.resultado    ?? 0, color: (dre.resultado ?? 0) >= 0 ? 'text-green-600' : 'text-red-600', bold: true, border: true },
                  ].map((item, i) => (
                    <div key={i} className={`flex justify-between items-center ${item.border ? 'border-t border-gray-100 pt-3' : ''}`}>
                      <span className={`text-sm ${item.bold ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{item.label}</span>
                      <span className={`text-sm ${item.bold ? 'font-bold' : ''} ${item.color}`}>{fmt(item.value)}</span>
                    </div>
                  ))}
                </div>

                {/* Despesas por categoria */}
                {dre.porCategoria && Object.keys(dre.porCategoria).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Despesas por categoria</p>
                    {Object.entries(dre.porCategoria).map(([cat, val]: any, i) => (
                      <div key={i} className="flex justify-between text-xs py-1">
                        <span className="text-gray-500">{cat}</span>
                        <span className="font-medium text-red-500">{fmt(val)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Receita vs Despesas</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[{ name: MESES[mes-1], receita: (dre.receita ?? 0)/100, despesas: (dre.totalDespesas ?? 0)/100 }]} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: unknown) => [`R$ ${Number(v).toLocaleString('pt-BR')}`, '']} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="receita"  fill="#2ecc71" radius={[4,4,0,0]} name="Receita" />
                    <Bar dataKey="despesas" fill="#e74c3c" radius={[4,4,0,0]} name="Despesas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA: GASTOS FIXOS */}
      {aba === 'gastos-fixos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Gastos fixos de {MESES[mes-1]}/{ano}</p>
            <Button size="sm" onClick={() => { setGastoForm({ categoria: '', valor: '', mes: String(mes), ano: String(ano) }); setShowGasto(true) }}>
              <Plus size={13} className="mr-1" /> Novo gasto fixo
            </Button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Categoria', 'Mês', 'Valor', ''].map((h, i) => (
                    <th key={i} className={`text-left text-xs font-medium text-gray-400 px-4 py-3 ${i === 2 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gastos.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-sm text-gray-400">Nenhum gasto fixo cadastrado.</td></tr>
                ) : gastos.map((g: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{g.categoria ?? g.categoria_id}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{MESES[(g.mes ?? 1) - 1]}/{g.ano}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-red-600">{fmt(g.valor)}</td>
                    <td className="px-4 py-3 text-center text-sm text-gray-300">—</td>
                  </tr>
                ))}
              </tbody>
              {gastos.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-gray-600">Total</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-red-600">
                      {fmt(gastos.reduce((a: number, g: any) => a + (g.valor ?? 0), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ABA: DEMONSTRATIVO */}
      {aba === 'demonstrativo' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Demonstrativo Anual — {ano}</h3>
            </div>
            {demo.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sem dados.</p>
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Mês', 'Receita', 'Despesas', 'Fixos', 'Resultado', 'Margem'].map((h, i) => (
                        <th key={i} className={`text-xs font-medium text-gray-400 px-4 py-3 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {demo.map((m: any, i: number) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{m.mes}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-green-600">{m.receita > 0 ? fmt(m.receita) : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-red-500">{m.despesas > 0 ? fmt(m.despesas) : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-red-400">{m.fixos > 0 ? fmt(m.fixos) : '—'}</td>
                        <td className={`px-4 py-2.5 text-right text-sm font-semibold ${m.resultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {m.receita > 0 || m.despesas > 0 ? fmt(m.resultado) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm text-gray-500">{m.receita > 0 ? `${m.margem}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-4 py-2.5 text-xs font-bold text-gray-700">Total</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-green-600">{fmt(demo.reduce((a: number, m: any) => a + m.receita, 0))}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-red-500">{fmt(demo.reduce((a: number, m: any) => a + m.despesas, 0))}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-red-400">{fmt(demo.reduce((a: number, m: any) => a + m.fixos, 0))}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-900">{fmt(demo.reduce((a: number, m: any) => a + m.resultado, 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>

                {/* Gráfico anual */}
                <div className="p-5 border-t border-gray-100">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={demo.map((m: any) => ({ mes: m.mes, receita: m.receita/100, despesas: m.despesas/100 }))} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: unknown) => [`R$ ${Number(v).toLocaleString('pt-BR')}`, '']} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="receita"  fill="#2ecc71" radius={[4,4,0,0]} name="Receita" />
                      <Bar dataKey="despesas" fill="#e74c3c" radius={[4,4,0,0]} name="Despesas" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {aba === 'a-pagar'     && <ContasPagarView   tenantSlug={tenantSlug} />}
      {aba === 'a-receber'   && <ContasReceberView tenantSlug={tenantSlug} />}
      {aba === 'conciliacao' && <ConciliacaoView   tenantSlug={tenantSlug} />}

      {/* Modal Despesa */}
      {showDespesa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">{editDespesa ? 'Editar despesa' : 'Nova despesa'}</h2>
              <button onClick={() => { setShowDespesa(false); setEditDespesa(null) }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input value={despForm.nome} onChange={e => setDF('nome', e.target.value)} className="mt-1" autoFocus placeholder="Ex: Conta de luz" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor (R$) *</Label>
                  <Input type="number" min="0" step="0.01" value={despForm.valor} onChange={e => setDF('valor', e.target.value)} className="mt-1" placeholder="0,00" />
                </div>
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={despForm.dataDespesa} onChange={e => setDF('dataDespesa', e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Categoria</Label>
                <select value={despForm.categoria} onChange={e => setDF('categoria', e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  {CATEGORIAS_DESPESA.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="recorrente" checked={despForm.recorrente} onChange={e => setDF('recorrente', e.target.checked)} className="rounded" />
                <Label htmlFor="recorrente" className="cursor-pointer">Despesa recorrente (repete todo mês)</Label>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <Button variant="outline" onClick={() => { setShowDespesa(false); setEditDespesa(null) }}>Cancelar</Button>
              <Button onClick={() => salvarDespMut.mutate()} disabled={!despForm.nome || !despForm.valor || salvarDespMut.isPending}>
                {salvarDespMut.isPending ? 'Salvando...' : editDespesa ? 'Salvar' : 'Lançar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gasto Fixo */}
      {showGasto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Novo gasto fixo</h2>
              <button onClick={() => setShowGasto(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <Label>Categoria *</Label>
                <Input value={gastoForm.categoria} onChange={e => setGF('categoria', e.target.value)} className="mt-1" placeholder="Ex: Aluguel" autoFocus />
              </div>
              <div>
                <Label>Valor (R$) *</Label>
                <Input type="number" min="0" step="0.01" value={gastoForm.valor} onChange={e => setGF('valor', e.target.value)} className="mt-1" placeholder="0,00" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Mês</Label>
                  <select value={gastoForm.mes} onChange={e => setGF('mes', e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Ano</Label>
                  <Input type="number" value={gastoForm.ano} onChange={e => setGF('ano', e.target.value)} className="mt-1" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <Button variant="outline" onClick={() => setShowGasto(false)}>Cancelar</Button>
              <Button onClick={() => salvarGastoMut.mutate()} disabled={!gastoForm.categoria || !gastoForm.valor || salvarGastoMut.isPending}>
                {salvarGastoMut.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <ConfirmModal title="Excluir despesa" message={`Excluir "${confirmDel.nome ?? confirmDel.descricao}"?`}
          confirmLabel="Excluir" danger
          onConfirm={() => { excluirDespMut.mutate(confirmDel.despesaId ?? confirmDel.despesa_id); setConfirmDel(null) }}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}