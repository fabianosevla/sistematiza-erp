'use client'
// components/modules/crm/CardapioAnaliseTab.tsx
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { InfoTip } from '@/components/ui/InfoTip'
import { fmtDataCurtaLocal as fmtDia } from '@/lib/format'

interface Props { tenantSlug: string }

export default function CardapioAnaliseTab({ tenantSlug }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-cardapio-analise', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/cardapio-analise?dias=14`)).json(),
  })
  const linhas: any[] = [...(data?.data ?? [])].reverse()

  const totais = linhas.reduce((a, l) => ({
    visualizacoes: a.visualizacoes + l.visualizacoes,
    pedidosMontados: a.pedidosMontados + l.pedidosMontados,
    vendasConfirmadas: a.vendasConfirmadas + l.vendasConfirmadas,
  }), { visualizacoes: 0, pedidosMontados: 0, vendasConfirmadas: 0 })

  const colunas: Coluna[] = [
    { chave: 'dia', titulo: 'Dia', render: (l: any) => fmtDia(l.dia) },
    { chave: 'visualizacoes', titulo: 'Visualizações', alinhamento: 'right' },
    { chave: 'pedidosMontados', titulo: 'Pedidos montados (WhatsApp)', alinhamento: 'right' },
    { chave: 'vendasConfirmadas', titulo: 'Vendas confirmadas', alinhamento: 'right',
      cabecalho: <InfoTip titulo="Vendas confirmadas">
        Só conta quando o pedido foi lançado com origem "Cardápio digital" e já virou venda —
        depende de quem lança o pedido marcar isso. Sem essa marcação, esse número fica em 0
        mesmo que a venda tenha vindo do cardápio.
      </InfoTip> },
  ]

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 size={20} className="text-gray-300 animate-spin" /></div>

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 inline-flex items-center gap-1">
        Funil dos últimos 14 dias do cardápio digital público.
      </p>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Visualizações</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{totais.visualizacoes}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Pedidos montados</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{totais.pedidosMontados}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Vendas confirmadas</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{totais.vendasConfirmadas}</p>
        </div>
      </div>

      <DataTable colunas={colunas} itens={linhas} chave={(l: any) => String(l.dia)} vazio="Sem movimento nos últimos 14 dias." />
    </div>
  )
}
