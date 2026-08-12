'use client'
// ESTE ARQUIVO VAI EM: components/cardapio/CardapioPublico.tsx
//
// TELA PÚBLICA — abre sem login, no celular do cliente, via link ou QR Code.
// Carrinho é local (useState); o pedido de verdade só nasce quando o cliente
// confirma, no POST /api/[tenant]/cardapio/pedido — que recalcula o preço no
// servidor, então o que está aqui é só para o cliente ver o total estimado.
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Plus, Minus, ShoppingCart, X, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt } from '@/lib/format'

interface Props { tenantSlug: string }

interface ItemCarrinho { produtoId: number; nome: string; precoVarejo: number; quantidade: number }

export default function CardapioPublico({ tenantSlug }: Props) {
  const { toast } = useToast()
  const api = `/api/${tenantSlug}/cardapio`

  const { data: raw, isLoading, isError } = useQuery({
    queryKey: ['cardapio-publico', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
    retry: false,
  })

  const [carrinho, setCarrinho]     = useState<ItemCarrinho[]>([])
  const [showCarrinho, setShowCarrinho] = useState(false)
  const [pedidoFeito, setPedidoFeito]   = useState<number | null>(null)

  const [nome, setNome]               = useState('')
  const [telefone, setTelefone]       = useState('')
  const [documento, setDocumento]     = useState('')
  const [tipoVenda, setTipoVenda]     = useState<'balcao' | 'entrega'>('entrega')
  const [endereco, setEndereco]       = useState('')
  const [formaPagamentoId, setFormaPagamentoId] = useState('')
  const [observacao, setObservacao]   = useState('')

  const empresa: any = raw?.data?.empresa ?? {}
  const produtos: any[] = raw?.data?.produtos ?? []
  const formasPagamento: any[] = raw?.data?.formasPagamento ?? []

  const categorias = [...new Set(produtos.map(p => p.categoria || 'Cardápio'))]

  function adicionar(p: any) {
    setCarrinho(prev => {
      const existe = prev.find(i => i.produtoId === p.produtoId)
      if (existe) return prev.map(i => i.produtoId === p.produtoId ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { produtoId: p.produtoId, nome: p.nome, precoVarejo: p.precoVarejo, quantidade: 1 }]
    })
  }
  function remover(produtoId: number) {
    setCarrinho(prev => prev
      .map(i => i.produtoId === produtoId ? { ...i, quantidade: i.quantidade - 1 } : i)
      .filter(i => i.quantidade > 0))
  }

  const totalItens = carrinho.reduce((a, i) => a + i.quantidade, 0)
  const totalCarrinho = carrinho.reduce((a, i) => a + i.quantidade * i.precoVarejo, 0)

  const pedirMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${api}/pedido`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome, telefone,
          documento: documento || null,
          tipoVenda,
          enderecoEntrega: tipoVenda === 'entrega' ? endereco : null,
          observacao: observacao || null,
          formaPagamentoId: formaPagamentoId ? Number(formaPagamentoId) : null,
          itens: carrinho.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Não foi possível enviar o pedido')
      return d
    },
    onSuccess: (d: any) => {
      setPedidoFeito(d?.data?.pedidoId ?? null)
      setCarrinho([])
    },
    onError: (e: any) => toast(e?.message ?? 'Erro ao enviar pedido', 'error'),
  })

  const podeConfirmar = nome.trim().length >= 2 && telefone.trim().length >= 8
    && (tipoVenda === 'balcao' || endereco.trim().length > 0)
    && !!formaPagamentoId && carrinho.length > 0

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Carregando cardápio...</div>
  }
  if (isError || !raw?.data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <p className="text-gray-500">Cardápio não disponível no momento.</p>
      </div>
    )
  }

  if (pedidoFeito) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center">
          <CheckCircle size={40} className="mx-auto text-green-500 mb-3" />
          <p className="text-lg font-semibold text-gray-900 mb-1">Pedido enviado!</p>
          <p className="text-sm text-gray-500 mb-4">Número do pedido: #{String(pedidoFeito).padStart(6, '0')}</p>
          <Button onClick={() => setPedidoFeito(null)}>Fazer novo pedido</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 py-5 text-center">
        {empresa.logoUrl && <img src={empresa.logoUrl} alt="" className="h-12 mx-auto mb-2 object-contain" />}
        <h1 className="text-lg font-bold text-gray-900">{empresa.nome}</h1>
        {empresa.telefone && <p className="text-xs text-gray-400 mt-1">{empresa.telefone}</p>}
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-6">
        {produtos.length === 0 && (
          <p className="text-center text-gray-400 py-12">Nenhum produto disponível no momento.</p>
        )}
        {categorias.map(cat => (
          <div key={cat}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{cat}</p>
            <div className="space-y-2">
              {produtos.filter(p => (p.categoria || 'Cardápio') === cat).map(p => {
                const noCarrinho = carrinho.find(i => i.produtoId === p.produtoId)
                return (
                  <div key={p.produtoId} className="bg-white rounded-xl border border-gray-100 p-3 flex gap-3 items-center">
                    {p.fotoUrl ? (
                      <img src={p.fotoUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-gray-100 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                      {p.descricao && <p className="text-xs text-gray-400 line-clamp-2">{p.descricao}</p>}
                      <p className="text-sm font-semibold text-green-700 mt-1">{fmt(p.precoVarejo)}</p>
                    </div>
                    {noCarrinho ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => remover(p.produtoId)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"><Minus size={14} /></button>
                        <span className="text-sm font-semibold w-5 text-center">{noCarrinho.quantidade}</span>
                        <button onClick={() => adicionar(p)} className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center"><Plus size={14} /></button>
                      </div>
                    ) : (
                      <Button size="sm" onClick={() => adicionar(p)} className="flex-shrink-0">Adicionar</Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {totalItens > 0 && !showCarrinho && (
        <button
          onClick={() => setShowCarrinho(true)}
          className="fixed bottom-4 left-4 right-4 max-w-2xl mx-auto h-12 rounded-xl text-white font-medium flex items-center justify-between px-5 shadow-lg"
          style={{ backgroundColor: '#2ecc71' }}
        >
          <span className="inline-flex items-center gap-2"><ShoppingCart size={16} /> {totalItens} item(ns)</span>
          <span>{fmt(totalCarrinho)}</span>
        </button>
      )}

      {showCarrinho && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Finalizar pedido</p>
              <button onClick={() => setShowCarrinho(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1">
                {carrinho.map(i => (
                  <div key={i.produtoId} className="flex justify-between text-sm">
                    <span className="text-gray-600">{i.quantidade}x {i.nome}</span>
                    <span className="text-gray-900">{fmt(i.quantidade * i.precoVarejo)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-100">
                  <span>Total</span>
                  <span>{fmt(totalCarrinho)}</span>
                </div>
              </div>

              <div>
                <Label>Nome *</Label>
                <Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Telefone/WhatsApp *</Label>
                <Input value={telefone} onChange={e => setTelefone(e.target.value)} className="mt-1" placeholder="(00) 00000-0000" />
              </div>
              <div>
                <Label>CPF (opcional)</Label>
                <Input value={documento} onChange={e => setDocumento(e.target.value)} className="mt-1" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTipoVenda('entrega')}
                  className={`h-9 rounded-lg text-sm font-medium border ${tipoVenda === 'entrega' ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 text-gray-500'}`}
                >Entrega</button>
                <button
                  onClick={() => setTipoVenda('balcao')}
                  className={`h-9 rounded-lg text-sm font-medium border ${tipoVenda === 'balcao' ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 text-gray-500'}`}
                >Retirar no balcão</button>
              </div>

              {tipoVenda === 'entrega' && (
                <div>
                  <Label>Endereço de entrega *</Label>
                  <Input value={endereco} onChange={e => setEndereco(e.target.value)} className="mt-1" placeholder="Rua, número, bairro" />
                </div>
              )}

              <div>
                <Label>Forma de pagamento *</Label>
                <select value={formaPagamentoId} onChange={e => setFormaPagamentoId(e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white">
                  <option value="">Selecione...</option>
                  {formasPagamento.map((f: any) => <option key={f.formaId} value={f.formaId}>{f.nome}</option>)}
                </select>
              </div>

              <div>
                <Label>Observação</Label>
                <Input value={observacao} onChange={e => setObservacao(e.target.value)} className="mt-1" />
              </div>

              <Button
                className="w-full h-11"
                disabled={!podeConfirmar || pedirMut.isPending}
                onClick={() => pedirMut.mutate()}
              >
                {pedirMut.isPending ? 'Enviando...' : `Confirmar pedido — ${fmt(totalCarrinho)}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
