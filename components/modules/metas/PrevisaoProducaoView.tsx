'use client'
// components/modules/metas/PrevisaoProducaoView.tsx — antes era a aba
// "Previsão de Produção" dentro de MetasView.tsx, agora é rota própria
// (/metas/previsao).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Label } from '@/components/ui/label'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'
import { fmtMoeda as fmt, fmtQtd } from '@/lib/format'
import MesNav, { MESES, useMesAno } from './MesNav'

interface Props { tenantSlug: string }

export default function PrevisaoProducaoView({ tenantSlug }: Props) {
  const api = `/api/${tenantSlug}/metas`
  const { mes, ano, navMes } = useMesAno()
  const [previsaoMeses, setPrevisaoMeses] = useState(3)

  const { data: previsaoRaw, isLoading: loadingPrevisao } = useQuery({
    queryKey: ['previsao-producao', tenantSlug, mes, ano, previsaoMeses],
    queryFn:  async () => (await fetch(`${api}?tipo=previsao&mes=${mes}&ano=${ano}&mesesHistorico=${previsaoMeses}`)).json(),
  })
  const previsao = previsaoRaw?.data

  return (
    <div>
      <PageHeader titulo="Previsão de Produção" subtitulo={<MesNav mes={mes} ano={ano} onNav={navMes} />} />

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Label className="text-sm text-gray-600 whitespace-nowrap inline-flex items-center gap-1">
            Meses de histórico
            <InfoTip titulo="Como a previsão é calculada">
              O sistema tira a média de vendas e pedidos dos meses anteriores para projetar
              quanto produzir em {MESES[mes - 1]} {ano}, quanto de cada insumo será necessário
              (pela ficha técnica) e qual o custo estimado.
            </InfoTip>
          </Label>
          <div className="flex gap-1">
            {[1, 2, 3, 6].map(n => (
              <button key={n} onClick={() => setPrevisaoMeses(n)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${previsaoMeses === n ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {n === 1 ? '1 mês' : `${n} meses`}
              </button>
            ))}
          </div>
        </div>

        {loadingPrevisao ? (
          <div className="text-center py-12 text-sm text-gray-400">Calculando previsão...</div>
        ) : !previsao ? (
          <div className="text-center py-12 text-sm text-gray-400">Sem dados históricos suficientes.</div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-700">Produção necessária por produto</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Produto', 'Média/mês', 'Pedidos pendentes', 'Prev. produção', 'Produzido no mês', 'Aderência', 'Receita estimada'].map((h, i) => (
                      <th key={i} className={`text-xs font-medium text-gray-400 px-4 py-3 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(previsao.produtos ?? []).length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-sm text-gray-400">Sem histórico de vendas para calcular.</td></tr>
                  ) : (previsao.produtos ?? []).map((p: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.nome}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">{p.mediaVendas.toFixed(1)} un</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">{p.pedidosPendentes} un</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-green-700">{p.previsaoProducao} un</span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">{p.produzidoReal === null ? '—' : `${p.produzidoReal} un`}</td>
                      <td className="px-4 py-3 text-right">
                        {p.aderenciaPct === null ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <span className={`text-sm font-bold ${p.aderenciaPct >= 90 ? 'text-green-600' : p.aderenciaPct >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{p.aderenciaPct.toFixed(0)}%</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-green-600">{fmt(p.receitaEstimada)}</td>
                    </tr>
                  ))}
                </tbody>
                {(previsao.produtos ?? []).length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-4 py-2.5 text-xs font-bold text-gray-600">Total</td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-600">
                        {(previsao.produtos ?? []).reduce((a: number, p: any) => a + p.mediaVendas, 0).toFixed(1)} un
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-600">
                        {(previsao.produtos ?? []).reduce((a: number, p: any) => a + p.pedidosPendentes, 0)} un
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold text-green-700">
                        {(previsao.produtos ?? []).reduce((a: number, p: any) => a + p.previsaoProducao, 0)} un
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-600">
                        {(previsao.produtos ?? []).reduce((a: number, p: any) => a + (p.produzidoReal ?? 0), 0)} un
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-400">—</td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold text-green-600">
                        {fmt((previsao.produtos ?? []).reduce((a: number, p: any) => a + p.receitaEstimada, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {(previsao.insumos ?? []).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-700 inline-flex items-center gap-1">
                    Insumos necessários
                    <InfoTip titulo="De onde vêm estes números">
                      Previsão de produção de cada produto multiplicada pela ficha técnica dele,
                      somando os insumos repetidos.
                    </InfoTip>
                  </h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Insumo', 'Unidade', 'Necessário', 'Estoque Atual', 'Comprar', 'Custo estimado'].map((h, i) => (
                        <th key={i} className={`text-xs font-medium text-gray-400 px-4 py-3 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(previsao.insumos ?? []).map((ins: any, i: number) => {
                      const precisaComprar = ins.necessario > ins.estoqueAtual
                      return (
                        <tr key={i} className={`border-b border-gray-50 ${precisaComprar ? 'bg-red-50/30' : ''}`}>
                          <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{ins.nome}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-gray-500">{ins.unidade}</td>
                          <td className="px-4 py-2.5 text-right text-sm text-gray-700">{fmtQtd(ins.necessario)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`text-sm font-medium ${precisaComprar ? 'text-red-600' : 'text-green-600'}`}>
                              {fmtQtd(ins.estoqueAtual)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {precisaComprar ? (
                              <span className="text-sm font-bold text-red-600">{(ins.necessario - ins.estoqueAtual).toFixed(3)}</span>
                            ) : (
                              <span className="text-xs text-green-600">✓ OK</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-700">{fmt(ins.custoEstimado)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td colSpan={5} className="px-4 py-2.5 text-xs font-bold text-gray-600">Custo total de insumos</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-red-600">
                        {fmt((previsao.insumos ?? []).reduce((a: number, i: any) => a + i.custoEstimado, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { label: 'Receita estimada',       value: previsao.totalReceitaEstimada, color: 'text-green-600' },
                { label: 'Custo de insumos',       value: previsao.totalCustoInsumos,    color: 'text-gray-600' },
                { label: 'Lucro bruto estimado',   value: previsao.totalReceitaEstimada - previsao.totalCustoInsumos, color: 'text-gray-600' },
              ].map((k, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-400">{k.label}</p>
                  <p className={`text-xl font-bold mt-1 ${k.color}`}>{fmt(k.value ?? 0)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
