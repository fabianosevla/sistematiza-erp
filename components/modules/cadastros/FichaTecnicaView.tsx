'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, BookOpen, ChevronRight, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useDominio } from '@/hooks/useDominio'

interface Props { tenantSlug: string }

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

export default function FichaTecnicaView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const unidades  = useDominio(tenantSlug, 'unidade_medida', ['kg','g','l','ml','un','cx'])

  const [selecionado, setSelecionado]     = useState<any>(null)
  const [busca, setBusca]                 = useState('')
  const [novoInsumoId, setNovoInsumoId]   = useState('')
  const [novaQtd, setNovaQtd]             = useState('')
  const [novaUnidade, setNovaUnidade]     = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; nome: string } | null>(null)

  const api = (id: number) => `/api/${tenantSlug}/cadastros/produtos/${id}/ficha`

  const { data: produtosRaw } = useQuery({
    queryKey: ['produtos-ficha', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos?limit=500`)).json(),
  })

  const { data: insumosRaw } = useQuery({
    queryKey: ['insumos-select', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/insumos?limit=500`)).json(),
  })

  const { data: fichaRaw, refetch } = useQuery({
    queryKey: ['ficha-tecnica', tenantSlug, selecionado?.produtoId],
    queryFn:  async () => (await fetch(api(selecionado.produtoId))).json(),
    enabled:  !!selecionado,
  })

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

  const addMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(api(selecionado.produtoId), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          insumoId:   Number(novoInsumoId),
          quantidade: parseFloat(novaQtd),
          unidade:    novaUnidade,
        }),
      })
      const data = await res.json()
      // CORREÇÃO: sem checar res.ok, o onSuccess disparava mesmo em erro 500,
      // mostrando "Insumo adicionado!" mas sem gravar nada.
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? `Erro ${res.status}`)
      return data
    },
    onSuccess: () => {
      refetch()
      setNovoInsumoId('')
      setNovaQtd('')
      toast('Insumo adicionado!')
    },
    onError: (err: any) => toast(err?.message ?? 'Erro ao adicionar.', 'error'),
  })

  const removeMut = useMutation({
    mutationFn: async (itemId: number) => {
      const res = await fetch(`${api(selecionado.produtoId)}/${itemId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? `Erro ${res.status}`)
      return data
    },
    onSuccess: () => { refetch(); toast('Insumo removido.') },
    onError:   (err: any) => toast(err?.message ?? 'Erro ao remover.', 'error'),
  })

  // ── DADOS DERIVADOS ───────────────────────────────────────────────────────

  const produtos = (
    Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data
    : Array.isArray(produtosRaw?.data)     ? produtosRaw.data
    : []
  ).filter((p: any) => p.nome?.toLowerCase().includes(busca.toLowerCase()))

  const insumos = Array.isArray(insumosRaw?.data?.data) ? insumosRaw.data.data
    : Array.isArray(insumosRaw?.data) ? insumosRaw.data : []

  // CORREÇÃO: a rota GET /ficha retorna ok({ itens: [...], custoProdução: ... })
  // que o helper ok() envolve em { data: { itens: [...], custoProdução: ... } }.
  // fichaRaw.data é um OBJETO, não um array — precisamos de fichaRaw.data.itens.
  // O código anterior fazia Array.isArray(fichaRaw?.data) que sempre retornava
  // false (objeto != array), caindo no [] e nunca exibindo os itens salvos.
  const fichaItens: any[] =
    Array.isArray(fichaRaw?.data?.itens) ? fichaRaw.data.itens
    : Array.isArray(fichaRaw?.itens)     ? fichaRaw.itens
    : Array.isArray(fichaRaw?.data)      ? fichaRaw.data
    : Array.isArray(fichaRaw)            ? fichaRaw
    : []

  // Custo total calculado localmente a partir dos preços dos insumos
  const custoTotal = fichaItens.reduce((acc: number, item: any) => {
    const ins = insumos.find((i: any) => i.insumoId === item.insumoId)
    if (!ins?.precoCusto) return acc
    return acc + parseFloat(String(item.quantidade)) * ins.precoCusto
  }, 0)

  const precoVarejo = selecionado?.precoVarejo ?? 0
  const lucroUnit   = precoVarejo - custoTotal
  const margem      = precoVarejo > 0 ? (lucroUnit / precoVarejo) * 100 : null

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Fichas Técnicas</h1>
          <p className="text-sm text-gray-400 mt-0.5">Insumos, quantidades e custo de produção por produto</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Lista de produtos ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Produtos</p>
            <Input
              placeholder="Buscar..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="divide-y divide-gray-50 max-h-[65vh] overflow-y-auto">
            {produtos.map((p: any) => (
              <button key={p.produtoId} onClick={() => setSelecionado(p)}
                className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                  selecionado?.produtoId === p.produtoId
                    ? 'bg-green-50 border-l-2 border-green-500 pl-[14px]'
                    : 'hover:bg-gray-50'
                }`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.nome}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.precoVarejo ? fmt(p.precoVarejo) : '—'}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300 flex-shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </div>

        {/* ── Painel da ficha ───────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          {!selecionado ? (
            <div className="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center h-64 text-center px-4">
              <BookOpen size={28} className="text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">Selecione um produto</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">Clique em qualquer produto para ver e editar sua ficha técnica</p>
            </div>
          ) : (
            <div className="space-y-3">

              {/* Header com margem */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{selecionado.nome}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      {selecionado.tipo && <Badge variant="secondary">{selecionado.tipo}</Badge>}
                      {precoVarejo > 0 && (
                        <span className="text-sm text-gray-500">
                          Varejo: <span className="font-semibold text-gray-900">{fmt(precoVarejo)}</span>
                        </span>
                      )}
                      {custoTotal > 0 && (
                        <span className="text-sm text-gray-500">
                          Custo prod.: <span className="font-semibold text-orange-600">{fmt(custoTotal)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  {margem !== null && (
                    <div className={`text-center px-4 py-2 rounded-xl border ${
                      margem >= 40 ? 'bg-green-50 border-green-200'
                      : margem >= 20 ? 'bg-amber-50 border-amber-200'
                      : 'bg-red-50 border-red-200'
                    }`}>
                      <p className="text-xs text-gray-500">Margem Bruta</p>
                      <p className={`text-2xl font-bold ${
                        margem >= 40 ? 'text-green-600'
                        : margem >= 20 ? 'text-amber-600'
                        : 'text-red-600'
                      }`}>
                        {margem.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-400">lucro: {fmt(lucroUnit)}/un</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Ficha */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">

                {/* Formulário adicionar */}
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                  <p className="text-xs font-medium text-gray-500 mb-3">Adicionar insumo à ficha</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Insumo *</Label>
                      <select
                        value={novoInsumoId}
                        onChange={e => {
                          setNovoInsumoId(e.target.value)
                          const ins = insumos.find((i: any) => i.insumoId === Number(e.target.value))
                          if (ins) setNovaUnidade(ins.unidade ?? 'kg')
                        }}
                        className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                        <option value="">Selecionar...</option>
                        {insumos.map((ins: any) => (
                          <option key={ins.insumoId} value={ins.insumoId}>
                            {ins.nome}{ins.precoCusto ? ` — ${fmt(ins.precoCusto)}/${ins.unidade}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Quantidade *</Label>
                      <Input
                        type="number" min="0" step="0.001"
                        value={novaQtd}
                        onChange={e => setNovaQtd(e.target.value)}
                        className="mt-1 h-9 text-sm"
                        placeholder="0.000"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Unidade</Label>
                      <select
                        value={novaUnidade}
                        onChange={e => setNovaUnidade(e.target.value)}
                        className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                        <option value="">—</option>
                        {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                  <Button
                    size="sm" className="mt-3"
                    onClick={() => addMut.mutate()}
                    disabled={!novoInsumoId || !novaQtd || addMut.isPending}>
                    <Plus size={13} className="mr-1" />
                    {addMut.isPending ? 'Adicionando...' : 'Adicionar'}
                  </Button>
                </div>

                {/* Itens da ficha */}
                {fichaItens.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <AlertTriangle size={20} className="text-amber-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-600">Ficha vazia</p>
                    <p className="text-xs text-gray-400 mt-1">Adicione os insumos para produzir 1 unidade deste produto</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/30">
                        <th className="text-left  text-xs font-medium text-gray-400 px-5 py-3">Insumo</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Quantidade / Un</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Preço Custo / Un</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Custo da Fração</th>
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {fichaItens.map((item: any) => {
                        const ins = insumos.find((i: any) => i.insumoId === item.insumoId)
                        const qtd = parseFloat(String(item.quantidade))
                        const precoCusto  = ins?.precoCusto ?? 0
                        const custoFracao = qtd * precoCusto

                        return (
                          <tr key={item.produtoInsumoId ?? item.itemId}
                            className="group border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="px-5 py-3 text-sm font-medium text-gray-900">
                              {item.nomeInsumo ?? ins?.nome ?? `#${item.insumoId}`}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-600">
                              {qtd.toFixed(3)} <span className="text-gray-400">{item.unidade}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-600">
                              {precoCusto ? fmt(precoCusto) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-semibold">
                              {custoFracao > 0
                                ? <span className="text-orange-600">{fmt(custoFracao)}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <button
                                onClick={() => setConfirmDelete({
                                  id:   item.produtoInsumoId ?? item.itemId,
                                  nome: item.nomeInsumo ?? ins?.nome ?? `#${item.insumoId}`,
                                })}
                                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>

                    {custoTotal > 0 && (
                      <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                        <tr>
                          <td colSpan={3} className="px-5 py-3 text-sm font-bold text-gray-700 text-right">
                            Custo total / unidade produzida
                          </td>
                          <td className="px-4 py-3 text-right text-base font-bold text-orange-600">
                            {fmt(custoTotal)}
                          </td>
                          <td />
                        </tr>
                        {precoVarejo > 0 && (
                          <tr>
                            <td colSpan={3} className="px-5 pb-3 text-sm font-bold text-gray-700 text-right">
                              Lucro bruto / unidade (varejo)
                            </td>
                            <td className={`px-4 pb-3 text-right text-base font-bold ${lucroUnit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {fmt(lucroUnit)}
                            </td>
                            <td />
                          </tr>
                        )}
                      </tfoot>
                    )}
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Remover insumo da ficha"
          message={`Remover "${confirmDelete.nome}" da ficha de ${selecionado?.nome}?`}
          confirmLabel="Remover"
          danger
          onConfirm={() => { removeMut.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}