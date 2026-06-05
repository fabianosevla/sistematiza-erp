'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props { tenantSlug: string }

function getWeekRange(date: Date) {
  const d     = new Date(date)
  const day   = d.getDay()
  const diff  = d.getDate() - day + (day === 0 ? -6 : 1)
  const start = new Date(d.setDate(diff))
  const end   = new Date(start)
  end.setDate(start.getDate() + 5)
  return { start, end }
}

function formatDate(date: Date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function toISO(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getStatusColor(quantidade: number, estoqueMinimo: number) {
  if (quantidade === 0) return ''
  if (quantidade <= estoqueMinimo) return 'bg-yellow-100 text-yellow-800'
  return 'bg-green-100 text-green-800'
}

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export default function ProducaoView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const [semanaBase, setSemanaBase] = useState(new Date())
  const [editando, setEditando]     = useState<{ produtoId: number; data: string } | null>(null)
  const [valorEdit, setValorEdit]   = useState('')

  const { start, end } = getWeekRange(semanaBase)
  const diasDaSemana   = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })

  const { data, isLoading } = useQuery({
    queryKey: ['producao-grade', tenantSlug, toISO(start), toISO(end)],
    queryFn: async () => {
      const params = new URLSearchParams({
        dataInicio: toISO(start),
        dataFim:    toISO(end),
      })
      const res = await fetch(`/api/${tenantSlug}/producao/grade?${params}`)
      return res.json()
    },
  })

  const salvarMutation = useMutation({
    mutationFn: async ({ produtoId, dataProducao, quantidade }: {
      produtoId: number; dataProducao: string; quantidade: number
    }) => {
      const res = await fetch(`/api/${tenantSlug}/producao/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtoId, dataProducao, quantidade }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producao-grade', tenantSlug] })
      setEditando(null)
    },
  })

  function iniciarEdicao(produtoId: number, data: string, qtdAtual: number) {
    setEditando({ produtoId, data })
    setValorEdit(qtdAtual > 0 ? String(qtdAtual) : '')
  }

  function confirmarEdicao() {
    if (!editando) return
    const qtd = parseInt(valorEdit) || 0
    salvarMutation.mutate({
      produtoId:    editando.produtoId,
      dataProducao: editando.data,
      quantidade:   qtd,
    })
  }

  const produtos = data?.data?.produtos ?? []
  const grade    = data?.data?.grade    ?? {}

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Produção Semanal</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {formatDate(start)} – {formatDate(end)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            const d = new Date(semanaBase)
            d.setDate(d.getDate() - 7)
            setSemanaBase(d)
          }}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSemanaBase(new Date())}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            const d = new Date(semanaBase)
            d.setDate(d.getDate() + 7)
            setSemanaBase(d)
          }}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      {/* Grade */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-48">Produto</th>
                <th className="text-xs font-medium text-gray-400 px-2 py-3 w-16 text-center">Estoque</th>
                {diasDaSemana.map((dia, i) => (
                  <th key={i} className="text-xs font-medium text-gray-400 px-2 py-3 text-center w-20">
                    <div>{DIAS[i]}</div>
                    <div className="font-normal text-gray-300">{formatDate(dia)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                    Carregando...
                  </td>
                </tr>
              ) : produtos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                    Nenhum produto cadastrado.
                  </td>
                </tr>
              ) : produtos.map((produto: any) => (
                <tr key={produto.produtoId} className="border-b border-gray-50 hover:bg-gray-50/30">
                  <td className="px-4 py-2">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-44">{produto.nome}</p>
                    <p className="text-xs text-gray-400">{produto.unidade}</p>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${produto.estoqueAtual <= produto.estoqueMinimo ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                      {produto.estoqueAtual}
                    </span>
                  </td>
                  {diasDaSemana.map((dia, i) => {
                    const dataStr  = toISO(dia)
                    const celula   = grade[produto.produtoId]?.[dataStr]
                    const qtd      = celula?.quantidade ?? 0
                    const isEditing = editando?.produtoId === produto.produtoId && editando?.data === dataStr

                    return (
                      <td key={i} className="px-2 py-2 text-center">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              value={valorEdit}
                              onChange={e => setValorEdit(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') confirmarEdicao()
                                if (e.key === 'Escape') setEditando(null)
                              }}
                              className="w-14 h-7 text-center text-sm border border-green-400 rounded focus:outline-none focus:ring-1 focus:ring-green-400"
                              autoFocus
                              onBlur={confirmarEdicao}
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => iniciarEdicao(produto.produtoId, dataStr, qtd)}
                            className={`w-12 h-7 rounded text-xs font-medium transition-colors ${qtd > 0 ? getStatusColor(qtd, produto.estoqueMinimo) : 'text-gray-300 hover:bg-gray-100'}`}
                          >
                            {qtd > 0 ? qtd : '—'}
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

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-100 inline-block" /> Planejado (ok)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-yellow-100 inline-block" /> Atenção (estoque baixo)
        </span>
        <span className="flex items-center gap-1.5 ml-2 italic">
          Clique em qualquer célula para editar
        </span>
      </div>
    </div>
  )
}