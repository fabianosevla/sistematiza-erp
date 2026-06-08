'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Factory, AlertTriangle, CheckCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props { tenantSlug: string }

function getWeekDates(offset = 0) {
  const now  = new Date()
  const day  = now.getDay()
  const mon  = new Date(now)
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d
  })
}

function fmtDate(d: Date) { return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }
function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export default function ProducaoView({ tenantSlug }: Props) {
  const qc = useQueryClient()
  const [weekOffset, setWeekOffset]       = useState(0)
  const [editandoCelula, setEditandoCelula] = useState<{ produtoId: number; data: string } | null>(null)
  const [valorCelula, setValorCelula]     = useState('')
  const [showPrevisao, setShowPrevisao]   = useState(false)
  const [showBaixa, setShowBaixa]         = useState(false)
  const [produtoBaixa, setProdutoBaixa]   = useState<any>(null)
  const [qtdBaixa, setQtdBaixa]           = useState('')
  const [previewBaixa, setPreviewBaixa]   = useState<any>(null)
  const [loadingBaixa, setLoadingBaixa]   = useState(false)
  const [resultadoBaixa, setResultadoBaixa] = useState<any>(null)

  const dias    = getWeekDates(weekOffset)
  const inicio  = isoDate(dias[0])
  const fim     = isoDate(dias[5])
  const apiGrade = `/api/${tenantSlug}/producao/grade`

  const { data: gradeData } = useQuery({
    queryKey: ['producao-grade', tenantSlug, inicio, fim],
    queryFn:  async () => (await fetch(`${apiGrade}?inicio=${inicio}&fim=${fim}`)).json(),
  })

  const { data: previsaoData } = useQuery({
    queryKey: ['producao-previsao', tenantSlug, inicio, fim],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/producao/previsao?inicio=${inicio}&fim=${fim}`)).json(),
    enabled:  showPrevisao,
  })

  const { data: produtosData } = useQuery({
    queryKey: ['produtos-select', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos`)).json(),
  })

  const salvarCelulaMut = useMutation({
    mutationFn: ({ produtoId, data, quantidade }: any) => fetch(apiGrade, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produtoId, dataProducao: data, quantidade: Number(quantidade) }),
    }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['producao-grade', tenantSlug] }),
  })

  function salvarCelula(produtoId: number, data: string) {
    salvarCelulaMut.mutate({ produtoId, data, quantidade: valorCelula })
    setEditandoCelula(null)
  }

  const grade    = gradeData?.data ?? gradeData ?? {}
  const produtos = Array.isArray(grade.produtos) ? grade.produtos : []
  const celulas  = grade.grade ?? {}

  const previsao = Array.isArray(previsaoData?.data) ? previsaoData.data
    : Array.isArray(previsaoData) ? previsaoData : []

  const todosProdutos = Array.isArray(produtosData?.data?.data) ? produtosData.data.data
    : Array.isArray(produtosData?.data) ? produtosData.data
    : []

  async function verPreviewBaixa() {
    if (!produtoBaixa || !qtdBaixa) return
    setLoadingBaixa(true)
    try {
      const res  = await fetch(`/api/${tenantSlug}/producao/baixar-insumos`, {
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
      const res  = await fetch(`/api/${tenantSlug}/producao/baixar-insumos`, {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Produção</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {fmtDate(dias[0])} – {fmtDate(dias[5])}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPrevisao(!showPrevisao)}>
            {showPrevisao ? 'Ocultar Previsão' : 'Ver Previsão de Insumos'}
          </Button>
          <Button onClick={() => setShowBaixa(true)}>
            <Factory size={14} className="mr-1.5" /> Registrar Produção
          </Button>
        </div>
      </div>

      {/* Navegação de semana */}
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
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-48">Produto</th>
                {DIAS.map((d, i) => (
                  <th key={d} className="text-center text-xs font-medium text-gray-400 px-3 py-3 w-24">
                    <div>{d}</div>
                    <div className="font-normal text-gray-300">{fmtDate(dias[i])}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {produtos.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum produto cadastrado para produção.</td></tr>
              ) : produtos.map((p: any) => (
                <tr key={p.produtoId} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{p.nome}</td>
                  {dias.map(dia => {
                    const dataStr = isoDate(dia)
                    const val     = celulas?.[p.produtoId]?.[dataStr] ?? 0
                    const isEdit  = editandoCelula?.produtoId === p.produtoId && editandoCelula?.data === dataStr
                    return (
                      <td key={dataStr} className="px-3 py-2.5 text-center">
                        {isEdit ? (
                          <input type="number" min="0" value={valorCelula}
                            onChange={e => setValorCelula(e.target.value)}
                            onBlur={() => salvarCelula(p.produtoId, dataStr)}
                            onKeyDown={e => { if (e.key === 'Enter') salvarCelula(p.produtoId, dataStr); if (e.key === 'Escape') setEditandoCelula(null) }}
                            className="w-16 h-7 text-center text-sm border border-green-400 rounded focus:outline-none" autoFocus />
                        ) : (
                          <button onClick={() => { setEditandoCelula({ produtoId: p.produtoId, data: dataStr }); setValorCelula(String(val || '')) }}
                            className={`w-16 h-7 rounded text-sm font-medium transition-colors ${val > 0 ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'text-gray-300 hover:bg-gray-100'}`}>
                            {val > 0 ? val : '—'}
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Previsão de Insumos */}
      {showPrevisao && (
        <div className="mt-4 bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Previsão de Insumos — semana atual</h3>
            <p className="text-xs text-gray-400 mt-0.5">Calculado com base na grade e ficha técnica de cada produto</p>
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
                    <td className="px-4 py-2.5 text-center text-sm text-gray-600">{parseFloat(String(item.totalNecessario ?? item.necessario ?? 0)).toFixed(3)} {item.unidade}</td>
                    <td className="px-4 py-2.5 text-center text-sm">
                      <span className={item.suficiente ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                        {item.estoqueAtual}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {item.suficiente
                        ? <span className="text-xs text-green-600 flex items-center justify-center gap-1"><CheckCircle size={12} /> OK</span>
                        : <span className="text-xs text-red-600 flex items-center justify-center gap-1"><AlertTriangle size={12} /> Insuficiente</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal Registrar Produção / Baixar Insumos */}
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
                    <Input type="number" min="1" value={qtdBaixa}
                      onChange={e => { setQtdBaixa(e.target.value); setPreviewBaixa(null) }}
                      className="mt-1" placeholder="Ex: 10" />
                  </div>

                  {!previewBaixa && (
                    <Button variant="outline" className="w-full" onClick={verPreviewBaixa} disabled={!produtoBaixa || !qtdBaixa || loadingBaixa}>
                      {loadingBaixa ? 'Calculando...' : 'Ver insumos que serão consumidos'}
                    </Button>
                  )}

                  {previewBaixa && (
                    <div>
                      {!previewBaixa.temFicha ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                          <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-amber-700">{previewBaixa.message}</p>
                        </div>
                      ) : (
                        <>
                          <div className="border border-gray-100 rounded-lg overflow-hidden mb-4">
                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                              <p className="text-xs font-medium text-gray-600">Insumos que serão baixados do estoque</p>
                            </div>
                            <table className="w-full">
                              <thead>
                                <tr className="border-b border-gray-100">
                                  {['Insumo', 'Consumo', 'Estoque Atual', 'Ficará'].map((h, i) => (
                                    <th key={h} className={`text-${i === 0 ? 'left' : 'center'} text-xs font-medium text-gray-400 px-3 py-2`}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {previewBaixa.itens?.map((item: any, i: number) => (
                                  <tr key={i} className={`border-b border-gray-50 last:border-0 ${!item.suficiente ? 'bg-red-50/30' : ''}`}>
                                    <td className="px-3 py-2 text-sm font-medium text-gray-900">{item.nomeInsumo}</td>
                                    <td className="px-3 py-2 text-center text-sm text-gray-600">{item.qtdNecessaria.toFixed(3)} {item.unidade}</td>
                                    <td className="px-3 py-2 text-center text-sm text-gray-600">{item.estoqueAtual.toFixed(3)}</td>
                                    <td className="px-3 py-2 text-center text-sm">
                                      <span className={item.suficiente ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                                        {Math.max(0, item.estoqueRestante).toFixed(3)}
                                        {!item.suficiente && <span className="text-xs ml-1">(insuficiente)</span>}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {previewBaixa.itens?.some((i: any) => !i.suficiente) && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                              <AlertTriangle size={14} className="text-amber-500 mt-0.5" />
                              <p className="text-xs text-amber-700">Alguns insumos estão abaixo do necessário. A baixa será feita até zerar o estoque disponível.</p>
                            </div>
                          )}
                          <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setPreviewBaixa(null)}>Recalcular</Button>
                            <Button className="flex-1" onClick={confirmarBaixa} disabled={loadingBaixa}>
                              {loadingBaixa ? 'Registrando...' : 'Confirmar Produção'}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
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