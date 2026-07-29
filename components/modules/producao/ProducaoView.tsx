'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Factory, AlertTriangle, CheckCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fmtQtd, fmtDataCurta as fmtDate } from '@/lib/format'

interface Props { tenantSlug: string }

function getWeekDates(offset = 0) {
  const now = new Date()
  const day = now.getDay()
  const mon = new Date(now)
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d
  })
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Quantidades de insumo: exibe até 6 casas decimais, mínimo 3, cortando zeros
// à direita. Necessário porque a ficha técnica agora aceita quantidades
// mínimas (ex.: orégano a 0,00027 kg por unidade) — com 3 casas fixas o
// consumo de poucas unidades aparecia como "0.000".

type CelulaKey = { produtoId: number; data: string; tipo: 'producao' | 'pedido' }

export default function ProducaoView({ tenantSlug }: Props) {
  const qc = useQueryClient()
  const [weekOffset, setWeekOffset]         = useState(0)
  const [editandoCelula, setEditandoCelula] = useState<CelulaKey | null>(null)
  const [valorCelula, setValorCelula]       = useState('')
  const [showPrevisao, setShowPrevisao]     = useState(false)
  const [showBaixa, setShowBaixa]           = useState(false)
  const [produtoBaixa, setProdutoBaixa]     = useState<any>(null)
  const [qtdBaixa, setQtdBaixa]             = useState('')
  const [previewBaixa, setPreviewBaixa]     = useState<any>(null)
  const [loadingBaixa, setLoadingBaixa]     = useState(false)
  const [resultadoBaixa, setResultadoBaixa] = useState<any>(null)

  const dias   = getWeekDates(weekOffset)
  const inicio = isoDate(dias[0])
  const fim    = isoDate(dias[5])

  const { data: gradeData } = useQuery({
    queryKey: ['producao-grade', tenantSlug, inicio, fim],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/producao/grade?inicio=${inicio}&fim=${fim}`)).json(),
  })

  const { data: previsaoData } = useQuery({
    queryKey: ['producao-previsao', tenantSlug, inicio, fim],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/producao/previsao?inicio=${inicio}&fim=${fim}`)).json(),
    enabled:  showPrevisao,
  })

  // Previsão semanal necessária — média histórica de todos os meses anteriores ÷ 4
  const { data: prevSemanalData } = useQuery({
    queryKey: ['previsao-semanal', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/metas?tipo=previsao&mes=${new Date().getMonth() + 1}&ano=${new Date().getFullYear()}&mesesHistorico=12`)).json(),
    staleTime: 300000, // 5 min
  })

  const { data: produtosData } = useQuery({
    queryKey: ['produtos-select', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos`)).json(),
  })

  const salvarCelulaMut = useMutation({
    mutationFn: ({ produtoId, data, quantidade, tipo }: any) => fetch(`/api/${tenantSlug}/producao/grade`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produtoId, dataProducao: data, quantidade: Number(quantidade), tipo }),
    }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['producao-grade', tenantSlug] }),
  })

  function iniciarEdicao(produtoId: number, data: string, tipo: 'producao' | 'pedido', valorAtual: number) {
    setEditandoCelula({ produtoId, data, tipo })
    setValorCelula(String(valorAtual || ''))
  }

  function salvarCelula(produtoId: number, data: string, tipo: 'producao' | 'pedido') {
    salvarCelulaMut.mutate({ produtoId, data, quantidade: valorCelula || '0', tipo })
    setEditandoCelula(null)
  }

  const grade        = gradeData?.data ?? gradeData ?? {}
  const produtos     = Array.isArray(grade.produtos) ? grade.produtos : []
  const celulas      = grade.grade ?? {}         // grade[produtoId][data] = qtd produção
  const celulasPed   = grade.pedidos ?? {}       // pedidos[produtoId][data] = qtd pedido (previsão de produção)

  const previsao = Array.isArray(previsaoData?.data) ? previsaoData.data
    : Array.isArray(previsaoData) ? previsaoData : []

  // Exclui produtos de revenda: eles não são produzidos (são comprados
  // prontos), então não aparecem no "Registrar Produção". A grade em si já
  // vem filtrada pela rota /producao/grade.
  const todosProdutos = (Array.isArray(produtosData?.data?.data) ? produtosData.data.data
    : Array.isArray(produtosData?.data) ? produtosData.data : [])
    .filter((p: any) => !p.revenda)

  // Mapa de previsão semanal por produto (média histórica ÷ 4)
  const prevSemanal: Record<number, number> = {}
  const prevProdutos = prevSemanalData?.data?.produtos ?? []
  for (const p of prevProdutos) {
    prevSemanal[p.produtoId] = Math.ceil((p.mediaVendas ?? 0) / 4)
  }

  async function verPreviewBaixa() {
    if (!produtoBaixa || !qtdBaixa) return
    setLoadingBaixa(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/producao/baixar-insumos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtoId: produtoBaixa.produtoId, quantidade: Number(qtdBaixa), confirmar: false }),
      })
      const data = await res.json()
      setPreviewBaixa(data?.data ?? data)
    } finally { setLoadingBaixa(false) }
  }

  async function confirmarBaixa() {
    if (!produtoBaixa || !qtdBaixa) return
    setLoadingBaixa(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/producao/baixar-insumos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtoId: produtoBaixa.produtoId, quantidade: Number(qtdBaixa), confirmar: true }),
      })
      const data = await res.json()
      setResultadoBaixa(data?.data ?? data)
      qc.invalidateQueries({ queryKey: ['estoque-insumos', tenantSlug] })
    } finally { setLoadingBaixa(false) }
  }

  function fecharBaixa() {
    setShowBaixa(false); setProdutoBaixa(null); setQtdBaixa('')
    setPreviewBaixa(null); setResultadoBaixa(null)
  }

  // Célula editável — usada APENAS para PP (previsão de produção).
  // O PED é somente leitura (puxado dos Pedidos), renderizado direto na tabela.
  function CelulaEditavel({ produtoId, data, tipo, valor, cor }: { produtoId: number; data: string; tipo: 'producao' | 'pedido'; valor: number; cor: string }) {
    const isEdit = editandoCelula?.produtoId === produtoId && editandoCelula?.data === data && editandoCelula?.tipo === tipo
    if (isEdit) {
      return (
        <input type="number" min="0" value={valorCelula}
          onChange={e => setValorCelula(e.target.value)}
          onBlur={() => salvarCelula(produtoId, data, tipo)}
          onKeyDown={e => {
            if (e.key === 'Enter') salvarCelula(produtoId, data, tipo)
            if (e.key === 'Escape') setEditandoCelula(null)
          }}
          className="w-10 h-6 text-center text-xs border border-green-400 rounded focus:outline-none" autoFocus />
      )
    }
    return (
      <button onClick={() => iniciarEdicao(produtoId, data, tipo, valor)}
        className={`w-10 h-6 rounded text-xs font-medium transition-colors ${valor > 0 ? `${cor} hover:opacity-80` : 'text-gray-200 hover:bg-gray-100'}`}>
        {valor > 0 ? valor : '—'}
      </button>
    )
  }

  // Célula somente leitura — PED (volume vindo dos Pedidos pela previsão de produção da semana)
  function CelulaPedido({ valor, cor }: { valor: number; cor: string }) {
    return (
      <span className={`inline-flex items-center justify-center w-10 h-6 rounded text-xs font-medium ${valor > 0 ? cor : 'text-gray-200'}`}>
        {valor > 0 ? valor : '—'}
      </span>
    )
  }

  // Totais por coluna
  const totaisPedDia: Record<string, number> = {}
  const totaisPrevDia: Record<string, number> = {}
  for (const dia of dias) {
    const d = isoDate(dia)
    totaisPedDia[d]  = produtos.reduce((a: number, p: any) => a + (celulasPed?.[p.produtoId]?.[d] ?? 0), 0)
    totaisPrevDia[d] = produtos.reduce((a: number, p: any) => a + (celulas?.[p.produtoId]?.[d] ?? 0), 0)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Produção</h1>
          <p className="text-sm text-gray-400 mt-0.5">{fmtDate(dias[0])} – {fmtDate(dias[5])}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPrevisao(!showPrevisao)}>
            {showPrevisao ? 'Ocultar Previsão Insumos' : 'Ver Previsão de Insumos'}
          </Button>
          <Button onClick={() => setShowBaixa(true)}>
            <Factory size={14} className="mr-1.5" /> Registrar Produção
          </Button>
        </div>
      </div>

      {/* Navegação semana */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft size={16} /></button>
        <span className="text-sm font-medium text-gray-700 min-w-48 text-center">
          {dias[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} – {dias[5].toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronRight size={16} /></button>
        {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="text-xs text-blue-600 hover:underline">Esta semana</button>}
      </div>

      {/* Grade */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 px-3 py-2 w-36 sticky left-0 bg-gray-50">Produto</th>
                <th className="text-center text-xs font-medium text-gray-500 px-2 py-2 w-16">Estoque</th>
                {DIAS.map((d, i) => (
                  <th key={d} className="text-center text-xs font-medium text-gray-400 px-0 py-1" colSpan={2}>
                    <div className="font-semibold text-gray-600">{d}</div>
                    <div className="text-[10px] text-gray-400">{fmtDate(dias[i])}</div>
                    <div className="grid grid-cols-2 text-[9px] text-gray-300 mt-0.5">
                      <span className="text-blue-400">Ped</span>
                      <span className="text-green-500">PP</span>
                    </div>
                  </th>
                ))}
                <th className="text-center text-xs font-medium text-blue-600 px-2 py-2 w-20">Total Ped.</th>
                <th className="text-center text-xs font-medium text-gray-500 px-2 py-2 w-20">Prev. Est.</th>
                <th className="text-center text-xs font-bold text-orange-600 px-2 py-2 w-24 bg-orange-50">Prod. Semanal Necessária</th>
              </tr>
            </thead>
            <tbody>
              {produtos.length === 0 ? (
                <tr><td colSpan={3 + DIAS.length * 2 + 3} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum produto cadastrado.</td></tr>
              ) : produtos.map((p: any) => {
                const estoque = p.estoqueAtual ?? 0
                let totalPed = 0, totalPrev = 0

                return (
                  <tr key={p.produtoId} className="border-b border-gray-50 hover:bg-gray-50/30 last:border-0">
                    <td className="px-3 py-2 text-xs font-medium text-gray-900 sticky left-0 bg-white whitespace-nowrap max-w-[140px] truncate">{p.nome}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`text-xs font-semibold ${estoque <= (p.estoqueMinimo ?? 0) ? 'text-red-600' : 'text-gray-700'}`}>{estoque}</span>
                    </td>
                    {dias.map(dia => {
                      const d = isoDate(dia)
                      const ped  = celulasPed?.[p.produtoId]?.[d] ?? 0
                      const prev = celulas?.[p.produtoId]?.[d] ?? 0
                      totalPed  += ped
                      totalPrev += prev
                      return (
                        <>
                          <td key={`ped-${d}`} className="px-0.5 py-1 text-center">
                            {/* PED — somente leitura: volume dos Pedidos (previsão de produção) */}
                            <CelulaPedido valor={ped} cor="bg-blue-100 text-blue-700" />
                          </td>
                          <td key={`prev-${d}`} className="px-0.5 py-1 text-center">
                            <CelulaEditavel produtoId={p.produtoId} data={d} tipo="producao" valor={prev} cor="bg-green-100 text-green-700" />
                          </td>
                        </>
                      )
                    })}
                    <td className="px-2 py-2 text-center">
                      <span className={`text-xs font-semibold ${totalPed > 0 ? 'text-blue-700' : 'text-gray-200'}`}>{totalPed > 0 ? totalPed : '—'}</span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      {(() => {
                        const prevEst = estoque + totalPrev - totalPed
                        return <span className={`text-xs font-semibold ${prevEst < 0 ? 'text-red-600' : 'text-gray-700'}`}>{prevEst}</span>
                      })()}
                    </td>
                    <td className="px-2 py-2 text-center bg-orange-50">
                      {(() => {
                        const ps = prevSemanal[p.produtoId] ?? 0
                        return <span className={`text-xs font-bold ${ps > 0 ? 'text-orange-600' : 'text-gray-300'}`}>{ps > 0 ? ps : '—'}</span>
                      })()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Totais */}
            {produtos.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-3 py-2 text-xs font-bold text-gray-600 sticky left-0 bg-gray-50">Total Geral ({produtos.length})</td>
                  <td className="px-2 py-2 text-center text-xs font-bold text-gray-700">
                    {produtos.reduce((a: number, p: any) => a + (p.estoqueAtual ?? 0), 0)}
                  </td>
                  {dias.map(dia => {
                    const d = isoDate(dia)
                    return (
                      <>
                        <td key={`tot-ped-${d}`} className="px-0.5 py-2 text-center text-xs font-bold text-blue-600">{totaisPedDia[d] > 0 ? totaisPedDia[d] : '—'}</td>
                        <td key={`tot-prev-${d}`} className="px-0.5 py-2 text-center text-xs font-bold text-green-600">{totaisPrevDia[d] > 0 ? totaisPrevDia[d] : '—'}</td>
                      </>
                    )
                  })}
                  <td className="px-2 py-2 text-center text-xs font-bold text-blue-700">
                    {Object.values(totaisPedDia).reduce((a: number, v) => a + v, 0) || '—'}
                  </td>
                  <td className="px-2 py-2 text-center text-xs text-gray-400">—</td>
                  <td className="px-2 py-2 text-center text-xs font-bold text-orange-600 bg-orange-50">
                    {Object.values(prevSemanal).reduce((a, v) => a + v, 0) || '—'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {/* Legenda */}
        <div className="px-4 py-2 border-t border-gray-100 flex gap-4 flex-wrap text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 inline-block" /> Pedido (Ped) — puxado dos Pedidos pela previsão de produção (somente leitura)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 inline-block" /> Previsão de Produção (PP) — editável</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-100 inline-block" /> Prod. Necessária = média histórica ÷ 4 semanas</span>
          <span className="text-gray-300">Prev. Est. = Estoque + Produção − Pedidos</span>
        </div>
      </div>

      {/* Previsão de Insumos */}
      {showPrevisao && (
        <div className="mt-4 bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Previsão de Insumos — semana atual</h3>
          </div>
          {previsao.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Sem produção planejada ou fichas técnicas não cadastradas.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Insumo', 'Necessário', 'Estoque Atual', 'Situação'].map((h, i) => (
                    <th key={h} className={`text-${i === 0 ? 'left' : 'center'} text-xs font-medium text-gray-400 px-4 py-3`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previsao.map((item: any, i: number) => (
                  <tr key={i} className={`border-b border-gray-50 ${!item.suficiente ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{item.nomeInsumo ?? item.nome}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-gray-600">{fmtQtd(item.totalNecessario ?? item.necessario ?? 0)} {item.unidade}</td>
                    <td className="px-4 py-2.5 text-center text-sm">
                      <span className={item.suficiente ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{item.estoqueAtual}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {item.suficiente
                        ? <span className="text-xs text-green-600 flex items-center justify-center gap-1"><CheckCircle size={12} /> OK</span>
                        : <span className="text-xs text-red-600 flex items-center justify-center gap-1"><AlertTriangle size={12} /> Insuficiente</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal Registrar Produção */}
      {showBaixa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold">Registrar Produção</h2>
                <p className="text-sm text-gray-400 mt-0.5">Baixa automática de insumos conforme ficha técnica</p>
              </div>
              <button onClick={fecharBaixa} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {!resultadoBaixa ? (
                <>
                  <div>
                    <Label>Produto *</Label>
                    <select value={produtoBaixa?.produtoId ?? ''}
                      onChange={e => { const p = todosProdutos.find((x: any) => x.produtoId === Number(e.target.value)); setProdutoBaixa(p ?? null); setPreviewBaixa(null) }}
                      className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                      <option value="">Selecionar produto...</option>
                      {todosProdutos.map((p: any) => <option key={p.produtoId} value={p.produtoId}>{p.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Quantidade produzida *</Label>
                    <Input type="number" min="1" value={qtdBaixa} onChange={e => { setQtdBaixa(e.target.value); setPreviewBaixa(null) }} className="mt-1" placeholder="Ex: 10" />
                  </div>
                  {!previewBaixa && (
                    <Button variant="outline" className="w-full" onClick={verPreviewBaixa} disabled={!produtoBaixa || !qtdBaixa || loadingBaixa}>
                      {loadingBaixa ? 'Calculando...' : 'Ver insumos que serão consumidos'}
                    </Button>
                  )}
                  {previewBaixa && (
                    <>
                      {!previewBaixa.temFicha ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                          <p className="text-sm text-amber-700">{previewBaixa.message}</p>
                        </div>
                      ) : (
                        <>
                          <table className="w-full border border-gray-100 rounded-lg overflow-hidden">
                            <thead><tr className="bg-gray-50">
                              {['Insumo','Consumo','Estoque','Ficará'].map((h,i) => <th key={h} className={`text-xs font-medium text-gray-400 px-3 py-2 ${i===0?'text-left':'text-center'}`}>{h}</th>)}
                            </tr></thead>
                            <tbody>
                              {previewBaixa.itens?.map((item: any, i: number) => (
                                <tr key={i} className={`border-t border-gray-50 ${!item.suficiente ? 'bg-red-50/30' : ''}`}>
                                  <td className="px-3 py-2 text-sm font-medium text-gray-900">{item.nomeInsumo}</td>
                                  <td className="px-3 py-2 text-center text-sm">{fmtQtd(item.qtdNecessaria)} {item.unidade}</td>
                                  <td className="px-3 py-2 text-center text-sm">{fmtQtd(item.estoqueAtual)}</td>
                                  <td className="px-3 py-2 text-center text-sm"><span className={item.suficiente ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{fmtQtd(Math.max(0, item.estoqueRestante))}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setPreviewBaixa(null)}>Recalcular</Button>
                            <Button className="flex-1" onClick={confirmarBaixa} disabled={loadingBaixa}>
                              {loadingBaixa ? 'Registrando...' : 'Confirmar Produção'}
                            </Button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                    <CheckCircle size={20} className="text-green-500" />
                    <div>
                      <p className="text-sm font-semibold text-green-700">Produção registrada!</p>
                      <p className="text-sm text-green-600">{resultadoBaixa.message}</p>
                    </div>
                  </div>
                  <Button className="w-full" onClick={fecharBaixa}>Fechar</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}