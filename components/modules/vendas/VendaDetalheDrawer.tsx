'use client'
// components/modules/vendas/VendaDetalheDrawer.tsx
//
// Mesmo detalhe de VendaDetalheView (dados da venda, resumo financeiro,
// itens), só que em painel lateral em vez de página cheia — pra abrir sem
// tirar quem está navegando o CRM (Ficha 360°, busca de cliente) do lugar
// onde estava. A tela cheia (/vendas/[id]) continua existindo pra quem
// chega pela tela de Vendas.
import { useQuery } from '@tanstack/react-query'
import { Package, CreditCard, User, Truck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SidePanel } from '@/components/ui/SidePanel'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { fmtMoeda as fmt, fmtDataHoraLocal as fmtDate, fmtQtd } from '@/lib/format'

interface Props { tenantSlug: string; vendaId: number; onClose: () => void }

export default function VendaDetalheDrawer({ tenantSlug, vendaId, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['venda-detalhe', tenantSlug, vendaId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/vendas/${vendaId}`)).json(),
  })
  const venda = data?.data

  const totalPagamentos = (venda?.pagamentos ?? []).reduce((a: number, p: any) => a + p.valor, 0)
  const troco = venda && totalPagamentos > venda.total ? totalPagamentos - venda.total : 0

  const colunas: Coluna[] = [
    { chave: 'nomeProduto', titulo: 'Produto', classeCelula: 'px-4 py-3 text-sm font-medium text-gray-900',
      render: (i: any) => i.nomeProduto },
    { chave: 'quantidade', titulo: 'Qtd', alinhamento: 'right', render: (i: any) => fmtQtd(i.quantidade) },
    { chave: 'precoUnitario', titulo: 'Preço unit.', alinhamento: 'right', render: (i: any) => fmt(i.precoUnitario) },
    { chave: 'subtotal', titulo: 'Subtotal', alinhamento: 'right', render: (i: any) => <span className="font-semibold text-gray-900">{fmt(i.subtotal)}</span> },
  ]

  return (
    <SidePanel
      titulo={venda ? `Venda #${venda.vendaId}` : 'Venda'}
      subtitulo={venda ? fmtDate(venda.vendidaEm) : undefined}
      cabecalho={venda ? <Badge variant="secondary">{venda.tipoEntrega ?? 'Retirada'}</Badge> : undefined}
      onClose={onClose}
      largura="w-[32vw] min-w-[520px]"
    >
      <div className="p-6 space-y-4">
        {isLoading ? (
          <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
        ) : !venda ? (
          <p className="text-sm text-gray-400 text-center py-8">Venda não encontrada.</p>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Dados da venda</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5">
                  <User size={15} className="text-gray-300 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-400">Cliente</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{venda.clienteNome ?? 'Consumidor Final'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <Truck size={15} className="text-gray-300 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-400">Tipo de entrega</p>
                    <p className="text-sm font-medium text-gray-900 capitalize truncate">{venda.tipoEntrega ?? 'Retirada'}</p>
                  </div>
                </div>
                {venda.vendedor && (
                  <div><p className="text-[11px] text-gray-400">Vendedor</p><p className="text-sm font-medium text-gray-900">{venda.vendedor}</p></div>
                )}
                {venda.dataEntrega && (
                  <div><p className="text-[11px] text-gray-400">Data de entrega</p><p className="text-sm font-medium text-gray-900">{fmtDate(venda.dataEntrega)}</p></div>
                )}
                {venda.enderecoEntrega && (
                  <div className="col-span-2"><p className="text-[11px] text-gray-400">Endereço de entrega</p><p className="text-sm font-medium text-gray-900">{venda.enderecoEntrega}</p></div>
                )}
                {venda.observacao && (
                  <div className="col-span-2"><p className="text-[11px] text-gray-400">Observação</p><p className="text-sm text-gray-600">{venda.observacao}</p></div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3 inline-flex items-center gap-1.5">
                <CreditCard size={12} /> Resumo
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-900">{fmt(venda.subtotal)}</span>
                </div>
                {venda.desconto > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Desconto</span>
                    <span className="text-red-600">-{fmt(venda.desconto)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline border-t border-gray-100 pt-2">
                  <span className="text-sm font-semibold text-gray-900">Total</span>
                  <span className="text-xl font-semibold" style={{ color: '#2ecc71' }}>{fmt(venda.total)}</span>
                </div>
                {(venda.pagamentos ?? []).length > 0 ? (
                  <div className="pt-2 mt-1 border-t border-gray-100 space-y-1.5">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pagamento</p>
                    {(venda.pagamentos ?? []).map((p: any, i: number) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-500">{p.forma}</span>
                        <span className="text-gray-900">{fmt(p.valor)}</span>
                      </div>
                    ))}
                    {troco > 0 && (
                      <div className="flex justify-between text-sm font-medium">
                        <span className="text-gray-700">Troco</span>
                        <span className="text-gray-900">{fmt(troco)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400 pt-2 mt-1 border-t border-gray-100">
                    Pagamento ainda não registrado — venda faturada na entrega do pedido, antes da baixa.
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Package size={12} className="text-gray-400" />
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  Itens da venda ({(venda.itens ?? []).length})
                </p>
              </div>
              <DataTable colunas={colunas} itens={venda.itens ?? []} chave={(i: any) => i.itemId} vazio="Esta venda não tem itens." />
            </div>
          </>
        )}
      </div>
    </SidePanel>
  )
}
