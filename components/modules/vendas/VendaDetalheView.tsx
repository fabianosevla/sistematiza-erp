'use client'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Package, CreditCard, User, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { fmtMoeda as fmt, fmtDataHoraLocal as fmtDate, fmtQtd } from '@/lib/format'

interface Props { tenantSlug: string; vendaId: number }



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

  // Itens na mesma tabela padrão do resto do sistema — cabeçalho congelado
  // e alinhamento vindo da coluna, não de um ternário no className.
  const colunas: Coluna[] = [
    {
      chave: 'nomeProduto', titulo: 'Produto',
      classeCelula: 'px-4 py-3 text-sm font-medium text-gray-900',
      render: (i: any) => i.nomeProduto,
    },
    { chave: 'quantidade',    titulo: 'Quantidade',  alinhamento: 'right', render: (i: any) => fmtQtd(i.quantidade) },
    { chave: 'precoUnitario', titulo: 'Preço unit.', alinhamento: 'right', render: (i: any) => fmt(i.precoUnitario) },
    {
      chave: 'desconto', titulo: 'Desconto', alinhamento: 'right',
      render: (i: any) => i.desconto > 0
        ? <span className="text-red-600">-{fmt(i.desconto)}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      chave: 'subtotal', titulo: 'Subtotal', alinhamento: 'right',
      render: (i: any) => <span className="font-semibold text-gray-900">{fmt(i.subtotal)}</span>,
    },
  ]

  return (
    <div>
      <PageHeader
        titulo={`Venda #${venda.vendaId}`}
        subtitulo={<span className="text-sm text-gray-400">{fmtDate(venda.vendidaEm)}</span>}
        tag={<Badge variant="secondary">{venda.tipoEntrega ?? 'Retirada'}</Badge>}
        acoes={
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft size={14} className="mr-1" /> Voltar
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Dados da venda */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 lg:col-span-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-4">Dados da venda</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <User size={16} className="text-gray-300 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-gray-400">Cliente</p>
                <p className="text-sm font-medium text-gray-900 truncate">{venda.clienteNome ?? 'Consumidor Final'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Truck size={16} className="text-gray-300 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] text-gray-400">Tipo de entrega</p>
                <p className="text-sm font-medium text-gray-900 capitalize truncate">{venda.tipoEntrega ?? 'Retirada'}</p>
              </div>
            </div>
            {venda.vendedor && (
              <div>
                <p className="text-[11px] text-gray-400">Vendedor</p>
                <p className="text-sm font-medium text-gray-900">{venda.vendedor}</p>
              </div>
            )}
            {venda.dataEntrega && (
              <div>
                <p className="text-[11px] text-gray-400">Data de entrega</p>
                <p className="text-sm font-medium text-gray-900">{fmtDate(venda.dataEntrega)}</p>
              </div>
            )}
            {venda.enderecoEntrega && (
              <div className="col-span-2">
                <p className="text-[11px] text-gray-400">Endereço de entrega</p>
                <p className="text-sm font-medium text-gray-900">{venda.enderecoEntrega}</p>
              </div>
            )}
            {venda.observacao && (
              <div className="col-span-2">
                <p className="text-[11px] text-gray-400">Observação</p>
                <p className="text-sm text-gray-600">{venda.observacao}</p>
              </div>
            )}
          </div>
        </div>

        {/* Resumo financeiro */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-4 inline-flex items-center gap-1.5">
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

            {(venda.pagamentos ?? []).length > 0 && (
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
            )}
          </div>
        </div>
      </div>

      {/* Itens */}
      <div className="mb-2 flex items-center gap-1.5">
        <Package size={12} className="text-gray-400" />
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
          Itens da venda ({(venda.itens ?? []).length})
        </p>
      </div>
      <DataTable
        colunas={colunas}
        itens={venda.itens ?? []}
        chave={(i: any) => i.itemId}
        vazio="Esta venda não tem itens."
        alturaMax="calc(100vh - 480px)"
      />
    </div>
  )
}
