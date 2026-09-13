'use client'
// components/modules/crm/Ficha360View.tsx
//
// Ficha 360° — rota própria (/crm/clientes/[id]), não painel lateral: é
// conteúdo demais (histórico de compra + cashback + pedidos + indicações)
// pra caber num SidePanel, e merece URL própria (voltar, compartilhar).
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Gift, ShoppingBag, Users2, Package } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/badge'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { fmtMoeda as fmt, fmtDataHoraLocal as fmtDataHora, fmtDataLocal as fmtData } from '@/lib/format'

interface Props { tenantSlug: string; clienteId: number }

const Anchor = 'a' as const

export default function Ficha360View({ tenantSlug, clienteId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['crm-ficha360', tenantSlug, clienteId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/clientes/${clienteId}`)).json(),
  })
  const ficha = data?.data

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 size={20} className="text-gray-300 animate-spin" /></div>
  }
  if (isError || !ficha) {
    return (
      <div>
        <Anchor href={`/${tenantSlug}/crm`} className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 mb-4">
          <ArrowLeft size={14} /> Voltar pro CRM
        </Anchor>
        <p className="text-sm text-gray-400">Cliente não encontrado.</p>
      </div>
    )
  }

  const { cliente, resumo, vendas, pedidos, indicacoes } = ficha

  // Mesmo padrão de filtro por coluna do resto do sistema (funil no
  // cabeçalho, opções sempre do conjunto sem filtro) — uma chave de filtro
  // por tabela, já que vendas e pedidos são listas independentes.
  const [filtrosVendas, setFiltrosVendas] = useState<Record<string, string>>({})
  const [filtrosPedidos, setFiltrosPedidos] = useState<Record<string, string>>({})
  function fazerAplicarFiltro(setFiltros: (fn: (f: Record<string, string>) => Record<string, string>) => void) {
    return (chave: string, valor: string) => setFiltros(f => {
      const novo = { ...f }
      if (valor) novo[chave] = valor
      else delete novo[chave]
      return novo
    })
  }
  function opcoesDe(itens: any[], chaves: string[]) {
    const mapa: Record<string, string[]> = {}
    for (const chave of chaves) {
      const set = new Set<string>()
      for (const item of itens) { const v = item?.[chave]; if (v) set.add(String(v)) }
      if (set.size > 0) mapa[chave] = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
    return mapa
  }
  function filtrar(itens: any[], filtros: Record<string, string>) {
    const chaves = Object.keys(filtros)
    if (chaves.length === 0) return itens
    return itens.filter(item => chaves.every(k => String(item?.[k] ?? '').toLowerCase().includes(filtros[k].toLowerCase())))
  }

  const vendasFiltradas  = useMemo(() => filtrar(vendas, filtrosVendas), [vendas, filtrosVendas])
  const opcoesVendas     = useMemo(() => opcoesDe(vendas, ['origem', 'status']), [vendas])
  const pedidosFiltrados = useMemo(() => filtrar(pedidos, filtrosPedidos), [pedidos, filtrosPedidos])
  const opcoesPedidos    = useMemo(() => opcoesDe(pedidos, ['status']), [pedidos])

  const colunasVendas: Coluna[] = [
    { chave: 'vendaId', titulo: 'Venda', largura: 'w-20', render: (v: any) => <span className="font-mono text-xs text-gray-500">#{v.vendaId}</span> },
    { chave: 'vendidaEm', titulo: 'Data', render: (v: any) => fmtDataHora(v.vendidaEm) },
    { chave: 'origem', titulo: 'Origem', esconderAte: 'md', filtravel: true, render: (v: any) => <Badge variant="outline">{v.origem}</Badge> },
    { chave: 'status', titulo: 'Status', esconderAte: 'md', filtravel: true },
    { chave: 'total', titulo: 'Total', alinhamento: 'right', render: (v: any) => <span className="font-semibold">{fmt(v.total)}</span> },
  ]

  const colunasPedidos: Coluna[] = [
    { chave: 'pedidoId', titulo: 'Pedido', largura: 'w-20', render: (p: any) => <span className="font-mono text-xs text-gray-500">#{p.pedidoId}</span> },
    { chave: 'dataPedido', titulo: 'Data', render: (p: any) => fmtDataHora(p.dataPedido) },
    { chave: 'previsaoEntrega', titulo: 'Previsão entrega', esconderAte: 'md', render: (p: any) => p.previsaoEntrega ? fmtDataHora(p.previsaoEntrega) : '—' },
    { chave: 'status', titulo: 'Status', filtravel: true, render: (p: any) => <Badge variant="outline">{p.status}</Badge> },
  ]

  return (
    <div>
      <Anchor href={`/${tenantSlug}/crm`} className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 mb-3">
        <ArrowLeft size={14} /> Voltar pro CRM
      </Anchor>

      <PageHeader
        titulo={cliente.nomeFantasia || cliente.nome}
        tag={<Badge variant="outline">{cliente.tipoPessoa}</Badge>}
        subtitulo={
          <span className="text-sm text-gray-500">
            {cliente.documento && <>{cliente.documento} · </>}
            {cliente.telefone || cliente.celular || 'sem telefone'}
            {cliente.cidade && <> · {cliente.cidade}/{cliente.uf}</>}
          </span>
        }
      />

      {cliente.indicadoPorNome && (
        <p className="text-xs text-gray-500 mb-4">Indicado por <span className="font-medium text-gray-700">{cliente.indicadoPorNome}</span></p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 inline-flex items-center gap-1"><ShoppingBag size={12} /> Compras</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{resumo.qtdCompras}</p>
          <p className="text-xs text-gray-400 mt-0.5">{resumo.ultimaCompra ? `última em ${fmtData(resumo.ultimaCompra)}` : 'nenhuma ainda'}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Total gasto</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{fmt(resumo.totalGasto)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Ticket médio</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{fmt(resumo.ticketMedio)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-500 inline-flex items-center gap-1"><Gift size={12} /> Saldo cashback</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{fmt(resumo.saldoCashback)}</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2 inline-flex items-center gap-1"><ShoppingBag size={14} /> Histórico de vendas</p>
          <DataTable colunas={colunasVendas} itens={vendasFiltradas} chave={(v: any) => v.vendaId} vazio="Nenhuma venda ainda."
            filtros={filtrosVendas} onFiltrar={fazerAplicarFiltro(setFiltrosVendas)} opcoesFiltro={opcoesVendas} />
        </div>

        {pedidos.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2 inline-flex items-center gap-1"><Package size={14} /> Pedidos</p>
            <DataTable colunas={colunasPedidos} itens={pedidosFiltrados} chave={(p: any) => p.pedidoId} vazio="Nenhum pedido ainda."
              filtros={filtrosPedidos} onFiltrar={fazerAplicarFiltro(setFiltrosPedidos)} opcoesFiltro={opcoesPedidos} />
          </div>
        )}

        {indicacoes.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2 inline-flex items-center gap-1"><Users2 size={14} /> Indicou</p>
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
              {indicacoes.map((i: any) => (
                <a key={i.clienteId} href={`/${tenantSlug}/crm/clientes/${i.clienteId}`} className="flex justify-between px-4 py-2.5 hover:bg-gray-50">
                  <span className="text-sm text-gray-900">{i.nome}</span>
                  <span className="text-xs text-gray-400">desde {fmtData(i.desde)}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
