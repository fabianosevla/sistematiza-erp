'use client'
// components/modules/metas/SimuladorView.tsx — antes era a aba "Simulador"
// dentro de MetasView.tsx, agora é rota própria (/metas/simulador).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Calculator, Lightbulb, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/Toast'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'
import { fmtMoeda as fmt } from '@/lib/format'
import MesNav, { MESES, useMesAno } from './MesNav'

interface Props { tenantSlug: string }
interface SimItem { _key: string; produtoId: number; nome: string; quantidade: number }

export default function SimuladorView({ tenantSlug }: Props) {
  const { toast } = useToast()
  const api = `/api/${tenantSlug}/metas`
  const { mes, ano, navMes } = useMesAno()

  const [simItens, setSimItens]     = useState<SimItem[]>([{ _key: '1', produtoId: 0, nome: '', quantidade: 1 }])
  const [simulado, setSimulado]     = useState<any>(null)
  const [simLoading, setSimLoading] = useState(false)

  const { data: produtosRaw } = useQuery({
    queryKey: ['produtos-metas', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos?limit=500`)).json(),
  })
  const produtos = Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data : Array.isArray(produtosRaw?.data) ? produtosRaw.data : []

  async function calcularSimulacao() {
    const validos = simItens.filter(i => i.produtoId > 0 && i.quantidade > 0)
    if (validos.length === 0) { toast('Adicione pelo menos um produto.', 'warning'); return }
    setSimLoading(true); setSimulado(null)
    try {
      const res  = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'simular', mes, ano, itens: validos.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })) }) })
      const data = await res.json()
      if (!res.ok) { toast(data?.message ?? 'Erro ao calcular a simulação.', 'error'); return }
      setSimulado(data?.data ?? data)
    } catch {
      toast('Erro ao calcular a simulação.', 'error')
    } finally { setSimLoading(false) }
  }

  return (
    <div>
      <PageHeader titulo="Simulador" subtitulo={<MesNav mes={mes} ano={ano} onNav={navMes} />} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-semibold text-gray-700">Produtos e Quantidades</p>
            <div className="flex items-center gap-1.5">
              {[5, 10, 15, 20, 25].map(n => (
                <Button key={n} size="sm" variant="outline"
                  onClick={() => setSimItens(prev => [
                    ...prev,
                    ...Array.from({ length: n }, (_, i) => ({ _key: `${Date.now()}-${i}`, produtoId: 0, nome: '', quantidade: 1 })),
                  ])}>
                  +{n}
                </Button>
              ))}
              <Button size="sm" variant="outline" onClick={() => setSimItens(prev => [...prev, { _key: Date.now().toString(), produtoId: 0, nome: '', quantidade: 1 }])}>
                <Plus size={13} className="mr-1" /> Produto
              </Button>
            </div>
          </div>
          <div className="space-y-2.5">
            {simItens.map(item => (
              <div key={item._key} className="flex items-center gap-2">
                <select value={item.produtoId}
                  onChange={e => { const p = produtos.find((p: any) => p.produtoId === Number(e.target.value)); setSimItens(prev => prev.map(it => it._key === item._key ? { ...it, produtoId: Number(e.target.value), nome: p?.nome ?? '' } : it)) }}
                  className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  <option value={0}>Selecionar produto...</option>
                  {produtos.map((p: any) => <option key={p.produtoId} value={p.produtoId}>{p.nome}{p.precoVarejo ? ` — ${fmt(p.precoVarejo)}` : ''}</option>)}
                </select>
                <Input type="number" min="1" value={item.quantidade}
                  onChange={e => setSimItens(prev => prev.map(it => it._key === item._key ? { ...it, quantidade: Number(e.target.value) || 1 } : it))}
                  className="h-9 text-sm text-center w-20" placeholder="Qtd" />
                {simItens.length > 1 && <button onClick={() => setSimItens(prev => prev.filter(it => it._key !== item._key))} className="text-gray-300 hover:text-red-500"><X size={16} /></button>}
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-gray-100 flex items-center gap-2">
            <InfoTip titulo="Como a projeção é calculada">
              A receita total soma o que já foi vendido em {MESES[mes - 1]} {ano} com a
              venda hipotética que você está simulando. O custo de insumos vem da ficha
              técnica só dos produtos escolhidos aqui — não inclui o custo do que já foi
              vendido no mês.
            </InfoTip>
            <Button className="flex-1" onClick={calcularSimulacao} disabled={simLoading}>
              {simLoading ? 'Calculando...' : <><Calculator size={14} className="mr-1.5" /> Calcular Projeção</>}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {!simulado ? (
            <div className="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center h-64 text-center px-4">
              <Calculator size={28} className="text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">Configure os produtos e clique em Calcular</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-4">Resultado da Simulação</p>
                <div className="space-y-2.5">
                  {[
                    { label: 'Já vendido no mês',   value:  simulado.receitaJaRealizada, cor: 'text-gray-500' },
                    { label: 'Receita da simulação', value:  simulado.receitaSimulada,    cor: 'text-green-600' },
                    { label: 'Receita Total Projetada', value: simulado.receitaTotalProjetada, cor: 'text-green-700', bold: true },
                    { label: 'Custo de Insumos (só da simulação)', value: -simulado.custoInsumos, cor: 'text-gray-600' },
                    { label: 'Lucro Bruto',         value:  simulado.lucroBruto,       cor: simulado.lucroBruto >= 0 ? 'text-green-600' : 'text-red-600', bold: true },
                    { label: 'Despesas do Mês',     value: -simulado.totalDespesas,    cor: 'text-red-500' },
                    { label: 'Resultado Projetado', value:  simulado.lucroLiquido,     cor: simulado.lucroLiquido >= 0 ? 'text-green-700' : 'text-red-700', bold: true, large: true },
                  ].map((row, i) => (
                    <div key={i} className={`flex justify-between items-center ${row.large ? 'border-t border-gray-200 pt-2.5 mt-1' : ''}`}>
                      <span className={row.bold ? 'font-semibold text-gray-700' : 'text-sm text-gray-500'}>{row.label}</span>
                      <span className={`font-semibold ${row.cor} ${row.large ? 'text-xl' : 'text-sm'}`}>
                        {row.value >= 0 ? fmt(row.value) : `-${fmt(Math.abs(row.value))}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {simulado.sugestoes?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2"><Lightbulb size={15} className="text-amber-600" /><p className="text-sm font-semibold text-amber-700">Sugestões</p></div>
                  <ul className="space-y-1.5">{simulado.sugestoes.map((s: string, i: number) => <li key={i} className="text-sm text-amber-700 flex items-start gap-2"><span className="text-amber-400 mt-0.5">→</span>{s}</li>)}</ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
