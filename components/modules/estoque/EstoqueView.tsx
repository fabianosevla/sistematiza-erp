'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, X, Download, Package, AlertTriangle, AlertCircle, MinusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface Props { tenantSlug: string }

type Aba = 'produtos' | 'insumos'
type Status = '' | 'normal' | 'atencao' | 'critico' | 'zerado'

const STATUS_LABEL: Record<string, string> = {
  normal:  'Normal',
  atencao: 'Atenção',
  critico: 'Crítico',
  zerado:  'Zerado',
}

const STATUS_COLOR: Record<string, string> = {
  normal:  'bg-green-500',
  atencao: 'bg-yellow-400',
  critico: 'bg-red-500',
  zerado:  'bg-gray-300',
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_COLOR[status] ?? 'bg-gray-300'}`} />
  )
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function exportCSV(data: any[], aba: Aba) {
  const isInsumo = aba === 'insumos'
  const headers = isInsumo
    ? ['Nome', 'Tipo', 'Unidade', 'Estoque Atual', 'Estoque Mínimo', 'Custo', 'Status']
    : ['Nome', 'Código de Barras', 'Unidade', 'Categoria', 'Estoque Atual', 'Estoque Mínimo', 'Preço Varejo', 'Status']

  const rows = data.map(item => isInsumo
    ? [item.nome, item.tipo, item.unidade, item.estoqueAtual, item.estoqueMinimo, (item.precoCusto / 100).toFixed(2), STATUS_LABEL[item.status] ?? '']
    : [item.nome, item.codigoBarras ?? '', item.unidade, item.categoria ?? '', item.estoqueAtual, item.estoqueMinimo, (item.precoVarejo / 100).toFixed(2), STATUS_LABEL[item.status] ?? '']
  )

  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `estoque-${aba}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function EstoqueView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const [aba, setAba]           = useState<Aba>('produtos')
  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState<Status>('')
  const [page, setPage]         = useState(1)
  const [showMov, setShowMov]   = useState(false)
  const [movItem, setMovItem]   = useState<any>(null)
  const [movTipo, setMovTipo]   = useState<'entrada' | 'saida' | 'ajuste'>('entrada')
  const [movQtd, setMovQtd]     = useState('')
  const [movCusto, setMovCusto] = useState('')
  const [movObs, setMovObs]     = useState('')

  const apiBase = `/api/${tenantSlug}/estoque`

  const { data, isLoading } = useQuery({
    queryKey: ['estoque', tenantSlug, aba, page, search, status],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (search) params.set('search', search)
      if (status) params.set('status', status)
      const res = await fetch(`${apiBase}/${aba}?${params}`)
      return res.json()
    },
  })

  const movMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`${apiBase}/movimentar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estoque', tenantSlug] })
      setShowMov(false)
      setMovItem(null)
      setMovQtd('')
      setMovCusto('')
      setMovObs('')
    },
  })

  function handleMov(item: any) {
    setMovItem(item)
    setMovTipo('entrada')
    setMovQtd('')
    setMovCusto('')
    setMovObs('')
    setShowMov(true)
  }

  function submitMov() {
    if (!movItem || !movQtd) return
    movMutation.mutate({
      entidade:   aba === 'produtos' ? 'produto' : 'insumo',
      entidadeId: aba === 'produtos' ? movItem.produtoId : movItem.insumoId,
      tipo:       movTipo,
      quantidade:  Number(movQtd),
      precoCusto: movCusto ? Math.round(parseFloat(movCusto) * 100) : undefined,
      observacao:  movObs || undefined,
    })
  }

  const items = data?.data?.data ?? []
  const meta  = data?.data?.meta
  const kpis  = data?.data?.kpis

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Estoque</h1>
          <p className="text-sm text-gray-400 mt-0.5">Controle de entradas e saídas</p>
        </div>
        <Button variant="outline" onClick={() => exportCSV(items, aba)}>
          <Download size={14} className="mr-1.5" /> Exportar CSV
        </Button>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: kpis.total, color: 'text-gray-900', bg: 'bg-white' },
            { label: 'Atenção', value: kpis.atencao, color: 'text-yellow-600', bg: 'bg-yellow-50' },
            { label: 'Crítico', value: kpis.critico, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Zerado', value: kpis.zerado, color: 'text-gray-500', bg: 'bg-gray-50' },
          ].map(k => (
            <div key={k.label} className={`${k.bg} rounded-xl border border-gray-100 p-4`}>
              <p className="text-xs text-gray-400">{k.label}</p>
              <p className={`text-2xl font-semibold mt-1 ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Abas */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(['produtos', 'insumos'] as Aba[]).map(a => (
          <button
            key={a}
            onClick={() => { setAba(a); setPage(1); setSearch(''); setStatus('') }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${aba === a ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder={`Buscar ${aba}...`}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value as Status); setPage(1) }}
          className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
        >
          <option value="">Todos os status</option>
          <option value="normal">Normal</option>
          <option value="atencao">Atenção</option>
          <option value="critico">Crítico</option>
          <option value="zerado">Zerado</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-8" />
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Nome</th>
              {aba === 'insumos' && <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Tipo</th>}
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Unidade</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Atual</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">Mínimo</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">
                {aba === 'produtos' ? 'Preço Varejo' : 'Custo'}
              </th>
              <th className="px-4 py-3 w-20 text-center text-xs font-medium text-gray-400">Ação</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum item encontrado.</td></tr>
            ) : items.map((item: any) => {
              const id = aba === 'produtos' ? item.produtoId : item.insumoId
              return (
                <tr key={id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <StatusDot status={item.status} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{item.nome}</p>
                    {item.codigoBarras && <p className="text-xs text-gray-400 font-mono">{item.codigoBarras}</p>}
                  </td>
                  {aba === 'insumos' && (
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge variant="secondary">{item.tipo}</Badge>
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{item.unidade}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-semibold ${item.status === 'critico' || item.status === 'zerado' ? 'text-red-600' : item.status === 'atencao' ? 'text-yellow-600' : 'text-gray-900'}`}>
                      {item.estoqueAtual}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-400 hidden lg:table-cell">{item.estoqueMinimo}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900 hidden lg:table-cell">
                    {aba === 'produtos' ? formatCents(item.precoVarejo) : formatCents(item.precoCusto)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleMov(item)}
                      className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium border border-green-200 hover:border-green-400 rounded-md px-2 py-1 transition-colors"
                    >
                      <Plus size={12} /> Mov.
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Paginação */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">Página {meta.page} de {meta.totalPages} — {meta.total} itens</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Próximo</Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Movimentação */}
      {showMov && movItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Movimentação de Estoque</h2>
                <p className="text-sm text-gray-400 mt-0.5">{movItem.nome}</p>
              </div>
              <button onClick={() => setShowMov(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="p-6 space-y-4">
              {/* Estoque atual */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                <span className="text-sm text-gray-500">Estoque atual</span>
                <span className="text-lg font-semibold text-gray-900">{movItem.estoqueAtual} {movItem.unidade}</span>
              </div>

              {/* Tipo */}
              <div>
                <Label>Tipo de movimentação *</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {(['entrada', 'saida', 'ajuste'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setMovTipo(t)}
                      className={`py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${movTipo === t ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                    >
                      {t === 'entrada' ? '+ Entrada' : t === 'saida' ? '- Saída' : '= Ajuste'}
                    </button>
                  ))}
                </div>
                {movTipo === 'ajuste' && (
                  <p className="text-xs text-gray-400 mt-1">Ajuste define o estoque exato, sem registrar entrada ou saída.</p>
                )}
              </div>

              {/* Quantidade */}
              <div>
                <Label>Quantidade ({movItem.unidade}) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={movQtd}
                  onChange={e => setMovQtd(e.target.value)}
                  className="mt-1"
                  placeholder="0"
                />
              </div>

              {/* Custo (só para entrada) */}
              {movTipo === 'entrada' && (
                <div>
                  <Label>Custo unitário (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={movCusto}
                    onChange={e => setMovCusto(e.target.value)}
                    className="mt-1"
                    placeholder="0,00"
                  />
                </div>
              )}

              {/* Observação */}
              <div>
                <Label>Observação</Label>
                <textarea
                  value={movObs}
                  onChange={e => setMovObs(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
                  placeholder="Motivo da movimentação (opcional)"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowMov(false)}>Cancelar</Button>
                <Button
                  onClick={submitMov}
                  disabled={!movQtd || movMutation.isPending}
                >
                  {movMutation.isPending ? 'Salvando...' : 'Confirmar movimentação'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}