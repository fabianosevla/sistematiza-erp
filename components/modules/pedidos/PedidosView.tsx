'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, ChevronRight, Clock, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface Props { tenantSlug: string }

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('pt-BR')
}

const STATUS_CONFIG: Record<string, { label: string; variant: any; icon: any }> = {
  pendente:   { label: 'Pendente',   variant: 'warning',     icon: Clock },
  producao:   { label: 'Em Produção', variant: 'default',    icon: Clock },
  pronto:     { label: 'Pronto',     variant: 'default',     icon: CheckCircle },
  entregue:   { label: 'Entregue',   variant: 'secondary',   icon: CheckCircle },
  cancelado:  { label: 'Cancelado',  variant: 'destructive', icon: XCircle },
}

export default function PedidosView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const apiBase = `/api/${tenantSlug}/pedidos`

  const [filtroStatus, setFiltroStatus]   = useState('pendente')
  const [showNovo, setShowNovo]           = useState(false)
  const [showDetalhe, setShowDetalhe]     = useState<number | null>(null)
  const [buscaCliente, setBuscaCliente]   = useState('')
  const [clienteSelecionado, setClienteSelecionado] = useState<any>(null)
  const [buscaProduto, setBuscaProduto]   = useState('')
  const [itens, setItens]               = useState<any[]>([])
  const [tipoVenda, setTipoVenda]         = useState('entrega')
  const [dataPedido, setDataPedido]       = useState(new Date().toISOString().slice(0, 10))
  const [previsaoProducao, setPrevisaoProducao] = useState('')
  const [previsaoEntrega, setPrevisaoEntrega]   = useState('')
  const [enderecoEntrega, setEnderecoEntrega]   = useState('')
  const [observacao, setObservacao]       = useState('')
  const [qtdProduto, setQtdProduto]       = useState(1)

  const { data: listData, isLoading } = useQuery({
    queryKey: ['pedidos', tenantSlug, filtroStatus],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filtroStatus) params.set('status', filtroStatus)
      const res = await fetch(`${apiBase}?${params}`)
      return res.json()
    },
  })

  const { data: detalheData } = useQuery({
    queryKey: ['pedido', tenantSlug, showDetalhe],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/${showDetalhe}`)
      return res.json()
    },
    enabled: !!showDetalhe,
  })

  const { data: clientesData } = useQuery({
    queryKey: ['clientes-pedido', tenantSlug, buscaCliente],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '6', search: buscaCliente })
      const res = await fetch(`/api/${tenantSlug}/cadastros/clientes?${params}`)
      return res.json()
    },
    enabled: buscaCliente.length > 1,
  })

  const { data: produtosData } = useQuery({
    queryKey: ['produtos-pedido', tenantSlug, buscaProduto],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '8', search: buscaProduto })
      const res = await fetch(`/api/${tenantSlug}/cadastros/produtos?${params}`)
      return res.json()
    },
    enabled: buscaProduto.length > 0,
  })

  const criarMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId:        clienteSelecionado?.clienteId,
          tipoVenda,
          dataPedido,
          previsaoProducao: previsaoProducao || undefined,
          previsaoEntrega:  previsaoEntrega  || undefined,
          valorEntrega:     0,
          enderecoEntrega:  enderecoEntrega  || undefined,
          observacao:       observacao       || undefined,
          itens: itens.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade, precoUnitario: i.precoUnitario })),
        }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pedidos', tenantSlug] })
      setShowNovo(false)
      resetForm()
    },
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`${apiBase}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pedidos', tenantSlug] })
      queryClient.invalidateQueries({ queryKey: ['pedido', tenantSlug] })
    },
  })

  function resetForm() {
    setClienteSelecionado(null)
    setBuscaCliente('')
    setItens([])
    setBuscaProduto('')
    setTipoVenda('entrega')
    setDataPedido(new Date().toISOString().slice(0, 10))
    setPrevisaoProducao('')
    setPrevisaoEntrega('')
    setEnderecoEntrega('')
    setObservacao('')
  }

  function addItem(produto: any) {
    const existing = itens.find(i => i.produtoId === produto.produtoId)
    if (existing) {
      setItens(prev => prev.map(i => i.produtoId === produto.produtoId ? { ...i, quantidade: i.quantidade + qtdProduto } : i))
    } else {
      setItens(prev => [...prev, {
        produtoId:     produto.produtoId,
        nomeProduto:   produto.nome,
        quantidade:    qtdProduto,
        precoUnitario: produto.precoVarejo,
        unidade:       produto.unidade,
      }])
    }
    setBuscaProduto('')
    setQtdProduto(1)
  }

  const pedidos  = listData?.data ?? []
  const detalhe  = detalheData?.data
  const clientes = clientesData?.data?.data ?? []
  const produtos = produtosData?.data?.data ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-400 mt-0.5">{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowNovo(true) }}>
          <Plus size={15} className="mr-1.5" /> Novo pedido
        </Button>
      </div>

      {/* Filtro status */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
        {[
          { value: 'pendente',  label: 'Pendentes' },
          { value: 'producao',  label: 'Em Produção' },
          { value: 'pronto',    label: 'Prontos' },
          { value: 'entregue',  label: 'Entregues' },
          { value: '',          label: 'Todos' },
        ].map(f => (
          <button key={f.value} onClick={() => setFiltroStatus(f.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filtroStatus === f.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-12 text-sm text-gray-400">Carregando...</div>
      ) : pedidos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-sm text-gray-400">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">#</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Data pedido</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Prev. entrega</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Tipo</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Status</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p: any) => {
                const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.pendente
                return (
                  <tr key={p.pedidoId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-400 font-mono">#{p.pedidoId}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{formatDate(p.dataPedido)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
                      {p.previsaoEntrega ? formatDate(p.previsaoEntrega) : '—'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge variant="outline">{p.tipoVenda === 'entrega' ? 'Entrega' : 'Balcão'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setShowDetalhe(p.pedidoId)}
                        className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1">
                        Ver <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Novo Pedido */}
      {showNovo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Novo pedido</h2>
              <button onClick={() => setShowNovo(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Cliente */}
              <div>
                <Label>Cliente (opcional)</Label>
                {clienteSelecionado ? (
                  <div className="mt-1 flex items-center justify-between px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                    <span className="text-sm font-medium text-green-800">{clienteSelecionado.nomeCompleto}</span>
                    <button onClick={() => setClienteSelecionado(null)} className="text-green-400 hover:text-green-600"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <Input value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)} placeholder="Buscar cliente..." className="mt-1" />
                    {buscaCliente.length > 1 && clientes.length > 0 && (
                      <div className="mt-1 border border-gray-100 rounded-lg overflow-hidden">
                        {clientes.map((c: any) => (
                          <button key={c.clienteId} onClick={() => { setClienteSelecionado(c); setBuscaCliente(''); if (c.endereco) setEnderecoEntrega(`${c.endereco}${c.numero ? ', ' + c.numero : ''} — ${c.cidade}/${c.uf}`) }}
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left">
                            <span className="text-sm font-medium text-gray-900">{c.nomeCompleto}</span>
                            <span className="text-xs text-gray-400">{c.cidade}/{c.uf}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Tipo + datas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <select value={tipoVenda} onChange={e => setTipoVenda(e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                    <option value="entrega">Entrega</option>
                    <option value="balcao">Balcão</option>
                  </select>
                </div>
                <div>
                  <Label>Data do pedido</Label>
                  <Input type="date" value={dataPedido} onChange={e => setDataPedido(e.target.value)} className="mt-1" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Previsão produção</Label>
                  <Input type="date" value={previsaoProducao} onChange={e => setPrevisaoProducao(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Previsão entrega</Label>
                  <Input type="date" value={previsaoEntrega} onChange={e => setPrevisaoEntrega(e.target.value)} className="mt-1" />
                </div>
              </div>

              {tipoVenda === 'entrega' && (
                <div>
                  <Label>Endereço de entrega</Label>
                  <Input value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)} className="mt-1" placeholder="Rua, número, bairro, cidade" />
                </div>
              )}

              {/* Produtos */}
              <div>
                <Label>Adicionar produto</Label>
                <Input value={buscaProduto} onChange={e => setBuscaProduto(e.target.value)} placeholder="Buscar produto..." className="mt-1" />
                {buscaProduto && produtos.length > 0 && (
                  <div className="mt-1 border border-gray-100 rounded-lg overflow-hidden">
                    {produtos.slice(0, 6).map((p: any) => (
                      <button key={p.produtoId} onClick={() => addItem(p)}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left">
                        <span className="text-sm font-medium text-gray-900">{p.nome}</span>
                        <span className="text-sm text-gray-500">{formatCents(p.precoVarejo)}/{p.unidade}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => setQtdProduto(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center font-bold hover:bg-gray-50">−</button>
                  <Input type="number" min="1" value={qtdProduto} onChange={e => setQtdProduto(Math.max(1, Number(e.target.value)))} className="text-center w-16 h-8" />
                  <button onClick={() => setQtdProduto(q => q + 1)} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center font-bold hover:bg-gray-50">+</button>
                </div>
              </div>

              {/* Itens */}
              {itens.length > 0 && (
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  {itens.map(item => (
                    <div key={item.produtoId} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.nomeProduto}</p>
                        <p className="text-xs text-gray-400">{item.quantidade} {item.unidade}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-semibold">{formatCents(item.quantidade * item.precoUnitario)}</p>
                        <button onClick={() => setItens(prev => prev.filter(i => i.produtoId !== item.produtoId))} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <Label>Observação</Label>
                <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 flex-shrink-0">
              <Button type="button" variant="outline" onClick={() => setShowNovo(false)}>Cancelar</Button>
              <Button onClick={() => criarMutation.mutate()} disabled={itens.length === 0 || criarMutation.isPending}>
                {criarMutation.isPending ? 'Salvando...' : 'Criar pedido'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalhe */}
      {showDetalhe && detalhe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Pedido #{detalhe.pedidoId}</h2>
                <p className="text-sm text-gray-400">{formatDate(detalhe.dataPedido)}</p>
              </div>
              <button onClick={() => setShowDetalhe(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Badge variant={(STATUS_CONFIG[detalhe.status] ?? STATUS_CONFIG.pendente).variant}>
                  {(STATUS_CONFIG[detalhe.status] ?? STATUS_CONFIG.pendente).label}
                </Badge>
                <Badge variant="outline">{detalhe.tipoVenda === 'entrega' ? 'Entrega' : 'Balcão'}</Badge>
              </div>

              {detalhe.previsaoEntrega && (
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-1">PREVISÃO ENTREGA</p>
                  <p className="text-sm text-gray-700">{formatDate(detalhe.previsaoEntrega)}</p>
                </div>
              )}

              {detalhe.enderecoEntrega && (
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-1">ENDEREÇO</p>
                  <p className="text-sm text-gray-700">{detalhe.enderecoEntrega}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-gray-400 mb-2">ITENS</p>
                {detalhe.itens.map((item: any) => (
                  <div key={item.itemId} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.nomeProduto}</p>
                      <p className="text-xs text-gray-400">{item.quantidade} un</p>
                    </div>
                    <p className="text-sm font-semibold">{formatCents(item.subtotal)}</p>
                  </div>
                ))}
              </div>

              {detalhe.observacao && (
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-1">OBSERVAÇÃO</p>
                  <p className="text-sm text-gray-700">{detalhe.observacao}</p>
                </div>
              )}

              {/* Ações de status */}
              {detalhe.status === 'pendente' && (
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={() => statusMutation.mutate({ id: detalhe.pedidoId, status: 'producao' })}>
                    Iniciar produção
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-500 border-red-200"
                    onClick={() => { if (confirm('Cancelar pedido?')) statusMutation.mutate({ id: detalhe.pedidoId, status: 'cancelado' }) }}>
                    Cancelar
                  </Button>
                </div>
              )}
              {detalhe.status === 'producao' && (
                <Button size="sm" onClick={() => statusMutation.mutate({ id: detalhe.pedidoId, status: 'pronto' })}>
                  Marcar como pronto
                </Button>
              )}
              {detalhe.status === 'pronto' && (
                <Button size="sm" onClick={() => statusMutation.mutate({ id: detalhe.pedidoId, status: 'entregue' })}>
                  Confirmar entrega
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}