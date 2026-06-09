'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Target, TrendingUp, TrendingDown, DollarSign,
  ChevronLeft, ChevronRight, Lightbulb, Calculator, Plus,
} from 'lucide-react'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'

interface Props { tenantSlug: string }

function fmt(c: number) {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

interface SimItem { _key: string; produtoId: number; nome: string; quantidade: number }

export default function MetasView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/metas`
  const now       = new Date()

  const [aba, setAba]               = useState<'metas' | 'simulador'>('metas')
  const [mes, setMes]               = useState(now.getMonth() + 1)
  const [ano, setAno]               = useState(now.getFullYear())
  const [showEditMeta, setShowEditMeta] = useState(false)

  // Form metas
  const [fReceita, setFReceita] = useState('')
  const [fDespesa, setFDespesa] = useState('')
  const [fLucro, setFLucro]     = useState('')

  // Simulador
  const [simItens, setSimItens]   = useState<SimItem[]>([{ _key: '1', produtoId: 0, nome: '', quantidade: 1 }])
  const [simulado, setSimulado]   = useState<any>(null)
  const [simLoading, setSimLoading] = useState(false)

  function navMes(d: number) {
    let m = mes + d; let a = ano
    if (m > 12) { m = 1;  a++ }
    if (m < 1)  { m = 12; a-- }
    setMes(m); setAno(a)
  }

  const { data: dadosRaw } = useQuery({
    queryKey: ['metas', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?mes=${mes}&ano=${ano}`)).json(),
  })

  const { data: produtosRaw } = useQuery({
    queryKey: ['produtos-metas', tenantSlug],
    queryFn:  async () =>
      (await fetch(`/api/${tenantSlug}/cadastros/produtos?limit=500`)).json(),
  })

  const salvarMetaMut = useMutation({
    mutationFn: () =>
      fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mes, ano,
          metaReceita:       fReceita ? Math.round(parseFloat(fReceita.replace(',', '.'))  * 100) : 0,
          metaDespesaMaxima: fDespesa ? Math.round(parseFloat(fDespesa.replace(',', '.'))  * 100) : 0,
          metaLucro:         fLucro   ? Math.round(parseFloat(fLucro.replace(',', '.'))    * 100) : 0,
        }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['metas', tenantSlug] })
      setShowEditMeta(false)
      toast('Meta salva!')
    },
    onError: () => toast('Erro ao salvar meta.', 'error'),
  })

  async function calcularSimulacao() {
    const validos = simItens.filter(i => i.produtoId > 0 && i.quantidade > 0)
    if (validos.length === 0) { toast('Adicione pelo menos um produto.', 'warning'); return }
    setSimLoading(true); setSimulado(null)
    try {
      const res  = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'simular', mes, ano,
          itens: validos.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
        }),
      })
      const data = await res.json()
      setSimulado(data?.data ?? data)
    } finally {
      setSimLoading(false)
    }
  }

  const dados    = dadosRaw?.data
  const meta     = dados?.meta
  const real     = dados?.real
  const produtos = Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data
    : Array.isArray(produtosRaw?.data) ? produtosRaw.data : []

  const eMesAtual = mes === now.getMonth() + 1 && ano === now.getFullYear()

  function ProgressBar({ value, max, invertColor = false }: { value: number; max: number; invertColor?: boolean }) {
    if (max <= 0) return null
    const pct  = Math.min(100, (value / max) * 100)
    const good = invertColor ? pct <= 80 : pct >= 100
    const warn = invertColor ? pct > 80 && pct <= 100 : pct >= 70 && pct < 100
    const cor  = good ? '#2ecc71' : warn ? '#f59e0b' : '#ef4444'
    return (
      <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
        <div className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: cor }} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Metas & Simulador</h1>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => navMes(-1)} className="p-0.5 text-gray-400 hover:text-gray-700">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-gray-700 min-w-36 text-center">
              {MESES[mes - 1]} {ano}
              {eMesAtual && (
                <span className="ml-2 text-xs font-normal text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                  mês atual
                </span>
              )}
            </span>
            <button onClick={() => navMes(1)} className="p-0.5 text-gray-400 hover:text-gray-700">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          { value: 'metas',     label: 'Metas',      icon: Target },
          { value: 'simulador', label: 'Simulador',  icon: Calculator },
        ] as const).map(a => (
          <button key={a.value} onClick={() => setAba(a.value)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              aba === a.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <a.icon size={14} /> {a.label}
          </button>
        ))}
      </div>

      {/* ── ABA METAS ──────────────────────────────────────────────────── */}
      {aba === 'metas' && (
        <div className="space-y-4">
          {real && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  label:        'Receita',
                  real:         real.receita,
                  metaVal:      meta?.metaReceita ?? 0,
                  icon:         TrendingUp,
                  corReal:      'text-green-600',
                  invertColor:  false,
                  labelMeta:    'Meta',
                },
                {
                  label:        'Despesas',
                  real:         real.despesa,
                  metaVal:      meta?.metaDespesaMaxima ?? 0,
                  icon:         TrendingDown,
                  corReal:      'text-red-600',
                  invertColor:  true,
                  labelMeta:    'Máximo',
                },
                {
                  label:        'Lucro',
                  real:         real.lucro,
                  metaVal:      meta?.metaLucro ?? 0,
                  icon:         DollarSign,
                  corReal:      real.lucro >= 0 ? 'text-green-600' : 'text-red-600',
                  invertColor:  false,
                  labelMeta:    'Meta',
                },
              ].map((card, i) => {
                const pct = card.metaVal > 0
                  ? Math.min(100, (card.real / card.metaVal) * 100)
                  : null
                return (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <card.icon size={16} className={card.corReal} />
                        <p className="text-sm font-medium text-gray-700">{card.label}</p>
                      </div>
                      {pct !== null && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          (!card.invertColor && pct >= 100) || (card.invertColor && pct <= 80)
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {pct.toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <p className={`text-2xl font-bold ${card.corReal}`}>{fmt(card.real)}</p>
                    {card.metaVal > 0 ? (
                      <>
                        <p className="text-xs text-gray-400 mt-1">
                          {card.labelMeta}: {fmt(card.metaVal)}
                          {!card.invertColor && card.real < card.metaVal && (
                            <span className="ml-2 text-amber-600">
                              faltam {fmt(card.metaVal - card.real)}
                            </span>
                          )}
                          {card.invertColor && card.real > card.metaVal && (
                            <span className="ml-2 text-red-600">
                              excedido em {fmt(card.real - card.metaVal)}
                            </span>
                          )}
                        </p>
                        <ProgressBar value={card.real} max={card.metaVal} invertColor={card.invertColor} />
                      </>
                    ) : (
                      <p className="text-xs text-gray-300 mt-2">Meta não definida</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => {
              setFReceita(meta?.metaReceita       ? (meta.metaReceita / 100).toFixed(2)       : '')
              setFDespesa(meta?.metaDespesaMaxima ? (meta.metaDespesaMaxima / 100).toFixed(2) : '')
              setFLucro(meta?.metaLucro           ? (meta.metaLucro / 100).toFixed(2)         : '')
              setShowEditMeta(true)
            }}>
              <Target size={14} className="mr-1.5" />
              Definir Metas de {MESES[mes - 1]}
            </Button>
          </div>

          {!meta?.metaReceita && !meta?.metaLucro && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <Lightbulb size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-700">
                Defina metas mensais para acompanhar o progresso em tempo real.
                Use o <b>Simulador</b> para projetar receitas e lucros antes de fechar o mês.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── ABA SIMULADOR ──────────────────────────────────────────────── */}
      {aba === 'simulador' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Input */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">Produtos e Quantidades</p>
              <Button size="sm" variant="outline"
                onClick={() => setSimItens(prev => [...prev, { _key: Date.now().toString(), produtoId: 0, nome: '', quantidade: 1 }])}>
                <Plus size={13} className="mr-1" /> Produto
              </Button>
            </div>

            <div className="space-y-2.5">
              {simItens.map(item => (
                <div key={item._key} className="flex items-center gap-2">
                  <select value={item.produtoId}
                    onChange={e => {
                      const p = produtos.find((p: any) => p.produtoId === Number(e.target.value))
                      setSimItens(prev => prev.map(it =>
                        it._key === item._key
                          ? { ...it, produtoId: Number(e.target.value), nome: p?.nome ?? '' }
                          : it
                      ))
                    }}
                    className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    <option value={0}>Selecionar produto...</option>
                    {produtos.map((p: any) => (
                      <option key={p.produtoId} value={p.produtoId}>
                        {p.nome}{p.precoVarejo ? ` — ${fmt(p.precoVarejo)}` : ''}
                      </option>
                    ))}
                  </select>
                  <Input type="number" min="1" value={item.quantidade}
                    onChange={e => setSimItens(prev => prev.map(it =>
                      it._key === item._key ? { ...it, quantidade: Number(e.target.value) || 1 } : it
                    ))}
                    className="h-9 text-sm text-center w-20" placeholder="Qtd" />
                  {simItens.length > 1 && (
                    <button onClick={() => setSimItens(prev => prev.filter(it => it._key !== item._key))}
                      className="text-gray-300 hover:text-red-500 transition-colors">
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-3">
                Usa fichas técnicas para calcular custo de insumos e considera as despesas
                de {MESES[mes - 1]} {ano}.
              </p>
              <Button className="w-full" onClick={calcularSimulacao} disabled={simLoading}>
                {simLoading
                  ? 'Calculando...'
                  : <><Calculator size={14} className="mr-1.5" /> Calcular Projeção</>
                }
              </Button>
            </div>
          </div>

          {/* Resultado */}
          <div className="space-y-3">
            {!simulado ? (
              <div className="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center h-64 text-center px-4">
                <Calculator size={28} className="text-gray-200 mb-3" />
                <p className="text-sm font-medium text-gray-500">Configure os produtos e clique em Calcular</p>
                <p className="text-xs text-gray-400 mt-1">
                  A projeção usa fichas técnicas e despesas do mês
                </p>
              </div>
            ) : (
              <>
                {/* Números */}
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-sm font-semibold text-gray-700 mb-4">Resultado da Simulação</p>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Receita Projetada',   value:  simulado.receitaProjetada, cor: 'text-green-600' },
                      { label: 'Custo de Insumos',    value: -simulado.custoInsumos,     cor: 'text-orange-600' },
                      { label: 'Lucro Bruto',         value:  simulado.lucroBruto,       cor: simulado.lucroBruto >= 0 ? 'text-green-600' : 'text-red-600', bold: true },
                      { label: 'Despesas do Mês',     value: -simulado.totalDespesas,    cor: 'text-red-500' },
                      { label: 'Resultado Projetado', value:  simulado.lucroLiquido,     cor: simulado.lucroLiquido >= 0 ? 'text-green-700' : 'text-red-700', bold: true, large: true },
                    ].map((row, i) => (
                      <div key={i} className={`flex justify-between items-center ${row.large ? 'border-t border-gray-200 pt-2.5 mt-1' : ''}`}>
                        <span className={`${row.bold ? 'font-semibold text-gray-700' : 'text-sm text-gray-500'}`}>
                          {row.label}
                        </span>
                        <span className={`font-semibold ${row.cor} ${row.large ? 'text-xl' : 'text-sm'}`}>
                          {row.value >= 0 ? fmt(row.value) : `-${fmt(Math.abs(row.value))}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* vs Meta */}
                {simulado.meta && (simulado.meta.metaReceita > 0 || simulado.meta.metaLucro > 0) && (
                  <div className="bg-white rounded-xl border border-gray-100 p-5">
                    <p className="text-sm font-semibold text-gray-700 mb-3">vs Metas de {MESES[mes - 1]}</p>
                    <div className="space-y-3">
                      {simulado.meta.metaReceita > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Receita</span>
                            <span>{fmt(simulado.receitaProjetada)} / {fmt(simulado.meta.metaReceita)}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="h-2 rounded-full bg-green-500 transition-all"
                              style={{ width: `${Math.min(100, (simulado.receitaProjetada / simulado.meta.metaReceita) * 100)}%` }} />
                          </div>
                        </div>
                      )}
                      {simulado.meta.metaLucro > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Lucro</span>
                            <span>{fmt(simulado.lucroLiquido)} / {fmt(simulado.meta.metaLucro)}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className={`h-2 rounded-full transition-all ${
                              simulado.lucroLiquido >= simulado.meta.metaLucro ? 'bg-green-500' : 'bg-amber-400'
                            }`}
                              style={{ width: `${Math.min(100, Math.max(0, (simulado.lucroLiquido / simulado.meta.metaLucro) * 100))}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sugestões */}
                {simulado.sugestoes?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb size={15} className="text-amber-600" />
                      <p className="text-sm font-semibold text-amber-700">Sugestões</p>
                    </div>
                    <ul className="space-y-1.5">
                      {simulado.sugestoes.map((s: string, i: number) => (
                        <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                          <span className="text-amber-400 mt-0.5 flex-shrink-0">→</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal Definir Meta */}
      {showEditMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold">Metas de {MESES[mes - 1]} {ano}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Deixe em branco para não monitorar</p>
              </div>
              <button onClick={() => setShowEditMeta(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <Label>Meta de Receita (R$)</Label>
                <Input type="number" min="0" step="0.01" value={fReceita}
                  onChange={e => setFReceita(e.target.value)} className="mt-1"
                  placeholder="Ex: 30000,00" autoFocus />
              </div>
              <div>
                <Label>Despesa Máxima (R$)</Label>
                <Input type="number" min="0" step="0.01" value={fDespesa}
                  onChange={e => setFDespesa(e.target.value)} className="mt-1"
                  placeholder="Ex: 8000,00" />
              </div>
              <div>
                <Label>Meta de Lucro (R$)</Label>
                <Input type="number" min="0" step="0.01" value={fLucro}
                  onChange={e => setFLucro(e.target.value)} className="mt-1"
                  placeholder="Ex: 15000,00" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowEditMeta(false)}>Cancelar</Button>
                <Button onClick={() => salvarMetaMut.mutate()} disabled={salvarMetaMut.isPending}>
                  {salvarMetaMut.isPending ? 'Salvando...' : 'Salvar Metas'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}