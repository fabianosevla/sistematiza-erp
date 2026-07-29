'use client'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Package, CreditCard, User, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { fmtMoeda as fmt } from '@/lib/format'

interface Props { tenantSlug: string; vendaId: number }


function fmtDate(d: string) { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

export default function VendaDetalheView({ tenantSlug, vendaId }: Props) {
  const router = useRouter()
  const { data, isLoading } = useQuery({
    queryKey: ['venda-detalhe', tenantSlug, vendaId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/vendas/${vendaId}`)).json(),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-sm text-gray-400">Carregando...</p>
    </div>
  )

  const venda = data?.data
  if (!venda) return (
    <div className="text-center py-12"><p className="text-gray-400">Venda não encontrada.</p></div>
  )

  const totalPagamentos = (venda.pagamentos ?? []).reduce((a: number, p: any) => a + p.valor, 0)
  const troco = totalPagamentos > venda.total ? totalPagamentos - venda.total : 0

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft size={14} className="mr-1" /> Voltar
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Venda #{venda.vendaId}</h1>
          <p className="text-sm text-gray-400">{fmtDate(venda.vendidaEm)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Info */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 col-span-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <User size={16} className="text-gray-300" />
              <div>
                <p className="text-xs text-gray-400">Cliente</p>
                <p className="text-sm font-medium">{venda.clienteNome ?? 'Consumidor Final'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Truck size={16} className="text-gray-300" />
              <div>
                <p className="text-xs text-gray-400">Tipo de Entrega</p>
                <p className="text-sm font-medium capitalize">{venda.tipoEntrega ?? 'Retirada'}</p>
              </div>
            </div>
            {venda.vendedor && (
              <div>
                <p className="text-xs text-gray-400">Vendedor</p>
                <p className="text-sm font-medium">{venda.vendedor}</p>
              </div>
            )}
            {venda.dataEntrega && (
              <div>
                <p className="text-xs text-gray-400">Data de Entrega</p>
                <p className="text-sm font-medium">{fmtDate(venda.dataEntrega)}</p>
              </div>
            )}
            {venda.enderecoEntrega && (
              <div className="col-span-2">
                <p className="text-xs text-gray-400">Endereço de Entrega</p>
                <p className="text-sm font-medium">{venda.enderecoEntrega}</p>
              </div>
            )}
            {venda.observacao && (
              <div className="col-span-2">
                <p className="text-xs text-gray-400">Observação</p>
                <p className="text-sm text-gray-600">{venda.observacao}</p>
              </div>
            )}
          </div>
        </div>

        {/* Resumo */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4"><CreditCard size={15} className="text-gray-400" /><p className="text-sm font-semibold text-gray-700">Resumo</p></div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span>{fmt(venda.subtotal)}</span></div>
            {venda.desconto > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Desconto</span><span className="text-red-500">-{fmt(venda.desconto)}</span></div>}
            <div className="flex justify-between text-sm font-bold border-t pt-2"><span>Total</span><span className="text-green-600">{fmt(venda.total)}</span></div>
            {(venda.pagamentos ?? []).map((p: any, i: number) => (
              <div key={i} className="flex justify-between text-sm"><span className="text-gray-400">{p.forma}</span><span>{fmt(p.valor)}</span></div>
            ))}
            {troco > 0 && <div className="flex justify-between text-sm text-amber-600"><span>Troco</span><span>{fmt(troco)}</span></div>}
          </div>
        </div>
      </div>

      {/* Itens */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Package size={15} className="text-gray-400" /><p className="text-sm font-semibold text-gray-700">Itens da Venda</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {['Produto','Quantidade','Preço Unit.','Subtotal'].map((h,i) => (
                <th key={h} className={`text-${i===0?'left':'right'} text-xs font-medium text-gray-400 px-4 py-3`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(venda.itens ?? []).map((item: any) => (
              <tr key={item.itemId} className="border-b border-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.nomeProduto}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-600">{item.quantidade}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-600">{fmt(item.precoUnitario)}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold">{fmt(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}