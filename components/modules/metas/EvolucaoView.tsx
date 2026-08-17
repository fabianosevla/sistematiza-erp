'use client'
// components/modules/metas/EvolucaoView.tsx — antes era a aba "Evolução"
// dentro de MetasView.tsx, agora é rota própria (/metas/evolucao).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Label } from '@/components/ui/label'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'
import { fmtMoeda as fmt } from '@/lib/format'
import MesNav, { MESES, useMesAno } from './MesNav'

interface Props { tenantSlug: string }

const ESTILO_TOOLTIP = {
  contentStyle: { borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', fontSize: 12, padding: '8px 10px' },
  labelStyle: { fontSize: 11, color: '#9ca3af', marginBottom: 2 },
}

export default function EvolucaoView({ tenantSlug }: Props) {
  const api = `/api/${tenantSlug}/metas`
  const { mes, ano, navMes } = useMesAno()
  const [evolucaoMeses, setEvolucaoMeses] = useState(6)
  const [evolucaoProjetar, setEvolucaoProjetar] = useState(3)

  const { data: evolucaoRaw, isLoading: loadingEvolucao } = useQuery({
    queryKey: ['evolucao-metas', tenantSlug, mes, ano, evolucaoMeses, evolucaoProjetar],
    queryFn:  async () => (await fetch(`${api}?tipo=evolucao&mes=${mes}&ano=${ano}&meses=${evolucaoMeses}&projetar=${evolucaoProjetar}`)).json(),
  })
  const evolucao = evolucaoRaw?.data

  const dadosEvolucao = (() => {
    if (!evolucao) return []
    const hist = evolucao.historico ?? []
    const proj = evolucao.projecao ?? []
    let bridgeIdx = hist.length - 1
    while (bridgeIdx >= 0 && hist[bridgeIdx].completo === false) bridgeIdx--
    const linhaHist = hist.map((h: any, i: number) => ({
      label: `${MESES[h.mes - 1].slice(0, 3)}/${String(h.ano).slice(2)}${h.completo === false ? ' (em andamento)' : ''}`,
      receita: h.receita, despesa: h.despesa, lucro: h.lucro,
      receitaProj: i === bridgeIdx ? h.receita : null,
      despesaProj: i === bridgeIdx ? h.despesa : null,
      lucroProj:   i === bridgeIdx ? h.lucro   : null,
    }))
    const linhaProj = proj.map((p: any) => ({
      label: `${MESES[p.mes - 1].slice(0, 3)}/${String(p.ano).slice(2)}`,
      receita: null, despesa: null, lucro: null,
      receitaProj: p.receitaProjetada, despesaProj: p.despesaProjetada, lucroProj: p.lucroProjetado,
    }))
    return [...linhaHist, ...linhaProj]
  })()

  return (
    <div>
      <PageHeader titulo="Evolução" subtitulo={<MesNav mes={mes} ano={ano} onNav={navMes} />} />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-gray-600 whitespace-nowrap">Histórico</Label>
            <div className="flex gap-1">
              {[3, 6, 12].map(n => (
                <button key={n} onClick={() => setEvolucaoMeses(n)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${evolucaoMeses === n ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {n} meses
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-gray-600 whitespace-nowrap inline-flex items-center gap-1">
              Projetar
              <InfoTip titulo="Como a projeção é calculada">
                Regressão linear simples sobre a receita e a despesa dos meses de
                histórico escolhidos — mostra a tendência, não é garantia. Com pouco
                histórico, a reta oscila bastante; use com cautela.
              </InfoTip>
            </Label>
            <div className="flex gap-1">
              {[0, 1, 3, 6].map(n => (
                <button key={n} onClick={() => setEvolucaoProjetar(n)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${evolucaoProjetar === n ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {n === 0 ? 'Nenhum' : `${n} ${n === 1 ? 'mês' : 'meses'}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loadingEvolucao ? (
          <div className="text-center py-12 text-sm text-gray-400">Calculando evolução...</div>
        ) : !evolucao || dadosEvolucao.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">Sem dados suficientes.</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            {evolucaoProjetar > 0 && evolucao.dadosInsuficientes && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                Só há {evolucao.mesesUsadosRegressao} mês(es) fechado(s) com movimento registrado —
                poucos pra apontar tendência com responsabilidade. A projeção não é mostrada até
                existirem pelo menos 3 meses fechados de histórico.
              </div>
            )}
            <div style={{ width: '100%', height: 340 }}>
              <ResponsiveContainer>
                <LineChart data={dadosEvolucao} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => `${(Number(v) / 100000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => fmt(Number(v ?? 0))} {...ESTILO_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="receita" name="Receita" stroke="#2ecc71" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                  <Line type="monotone" dataKey="despesa" name="Despesa" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                  <Line type="monotone" dataKey="lucro"   name="Lucro"   stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                  <Line type="monotone" dataKey="receitaProj" name="Receita (projetada)" stroke="#2ecc71" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="despesaProj" name="Despesa (projetada)" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="lucroProj"   name="Lucro (projetado)"   stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
