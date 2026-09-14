'use client'
// components/modules/crm/Ficha360View.tsx
//
// Ficha 360° — rota própria (/crm/clientes/[id]), não painel lateral: é
// conteúdo demais (histórico de compra + cashback + pedidos + indicações)
// pra caber num SidePanel, e merece URL própria (voltar, compartilhar).
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Gift, ShoppingBag, Users2, Eye } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/badge'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import VendaDetalheDrawer from '@/components/modules/vendas/VendaDetalheDrawer'
import { fmtMoeda as fmt, fmtDataHoraLocal as fmtDataHora, fmtDataLocal as fmtData } from '@/lib/format'

interface Props { tenantSlug: string; clienteId: number }

// A ficha vem inteira numa resposta só; paginar aqui é o mesmo padrão do
// resto do sistema quando isso acontece (ver ClientesTab).
const POR_PAGINA = 20

const Anchor = 'a' as const

export default function Ficha360View({ tenantSlug, clienteId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['crm-ficha360', tenantSlug, clienteId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/clientes/${clienteId}`)).json(),
  })
  const ficha    = data?.data
  // Arrays vazios enquanto carrega/erro — os hooks abaixo (useState, useMemo)
  // têm que rodar em TODO render, na mesma quantidade e ordem. Antes eles
  // vinham depois do "if (isLoading) return" / "if (!ficha) return", e o
  // primeiro render (carregando) chamava menos hooks que o segundo (carregado)
  // — React trava com "Rendered more hooks than during the previous render"
  // (erro #310) e a tela quebra em branco. Por isso as duas listas usam
  // `?? []` aqui, ANTES de qualquer return condicional.
  const vendas   = ficha?.vendas   ?? []
  const pedidos  = ficha?.pedidos  ?? []

  // VENDA E PEDIDO NUMA TABELA SÓ.
  //
  // Eram duas tabelas separadas — "Histórico de vendas" e "Pedidos" — e um
  // pedido que já virou venda (toda entrega gera uma, ver
  // app/api/[tenant]/pedidos/[id]/route.ts) aparecia NAS DUAS: uma vez como
  // pedido, outra como a venda que ele mesmo gerou. Mesma operação, contada
  // duas vezes pro usuário.
  //
  // Regra: um pedido só aparece aqui SE a venda dele não estiver mais ativa
  // (nunca chegou a virar venda, ou virou e foi cancelada depois) — nesses
  // casos ele é a única representação que sobrou do que aconteceu. Se a
  // venda existe e está ativa, ela já representa a operação sozinha.
  const vendaIdsAtivos = useMemo(() => new Set(vendas.map((v: any) => v.vendaId)), [vendas])
  const pedidosSemVendaAtiva = useMemo(
    () => pedidos.filter((p: any) => !p.vendaId || !vendaIdsAtivos.has(p.vendaId)),
    [pedidos, vendaIdsAtivos],
  )
  const operacoes = useMemo(() => {
    const linhas = [
      ...vendas.map((v: any) => ({
        tipoOperacao: 'Venda', id: v.vendaId, data: v.vendidaEm,
        origem: v.origem, status: v.status, total: v.total,
      })),
      ...pedidosSemVendaAtiva.map((p: any) => ({
        tipoOperacao: 'Pedido', id: p.pedidoId, data: p.dataPedido,
        origem: null, status: p.status, total: p.total,
      })),
    ]
    return linhas.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
  }, [vendas, pedidosSemVendaAtiva])

  const [filtrosOp, setFiltrosOp] = useState<Record<string, string>>({})
  const [paginaOp, setPaginaOp]   = useState(1)
  function aplicarFiltroOp(chave: string, valor: string) {
    setFiltrosOp(f => {
      const novo = { ...f }
      if (valor) novo[chave] = valor
      else delete novo[chave]
      return novo
    })
    setPaginaOp(1)
  }
  const operacoesFiltradas = useMemo(() => {
    const chaves = Object.keys(filtrosOp)
    if (chaves.length === 0) return operacoes
    return operacoes.filter(o => chaves.every(k => String((o as any)?.[k] ?? '').toLowerCase().includes(filtrosOp[k].toLowerCase())))
  }, [operacoes, filtrosOp])
  const opcoesFiltroOp = useMemo(() => {
    const mapa: Record<string, string[]> = {}
    for (const chave of ['tipoOperacao', 'origem', 'status']) {
      const set = new Set<string>()
      for (const o of operacoes) { const v = (o as any)?.[chave]; if (v) set.add(String(v)) }
      if (set.size > 0) mapa[chave] = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
    return mapa
  }, [operacoes])
  const totalPaginasOp = Math.max(1, Math.ceil(operacoesFiltradas.length / POR_PAGINA))
  const paginaAtualOp  = Math.min(paginaOp, totalPaginasOp)
  const operacoesPagina = operacoesFiltradas.slice((paginaAtualOp - 1) * POR_PAGINA, paginaAtualOp * POR_PAGINA)

  // Abre o detalhe da venda em painel lateral — mesmo padrão de
  // ConsultasView (DetalheVenda): quem está olhando o histórico do cliente
  // quer ver a venda e voltar pra cá, não navegar pra outra tela e perder o
  // lugar. Pedido que ainda não virou venda não tem detalhe pra abrir aqui.
  const [vendaAberta, setVendaAberta] = useState<number | null>(null)

  // SÓ AGORA, depois de todo hook já ter rodado, é que a tela pode sair mais
  // cedo pra carregando/erro.
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

  const { cliente, resumo, indicacoes } = ficha

  const colunasOperacoes: Coluna[] = [
    { chave: 'tipoOperacao', titulo: 'Tipo', largura: 'w-24', filtravel: true,
      render: (o: any) => (
        <Badge variant={o.tipoOperacao === 'Venda' ? 'secondary' : 'outline'}>{o.tipoOperacao}</Badge>
      ) },
    { chave: 'id', titulo: '#', largura: 'w-16',
      render: (o: any) => <span className="font-mono text-xs text-gray-500">#{o.id}</span> },
    { chave: 'data', titulo: 'Data', render: (o: any) => fmtDataHora(o.data) },
    { chave: 'origem', titulo: 'Origem', esconderAte: 'md', filtravel: true,
      render: (o: any) => o.origem ? <Badge variant="outline">{o.origem}</Badge> : <span className="text-gray-300">—</span> },
    { chave: 'status', titulo: 'Status', esconderAte: 'md', filtravel: true },
    { chave: 'total', titulo: 'Total', alinhamento: 'right', render: (o: any) => <span className="font-semibold">{fmt(o.total)}</span> },
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
          <p className="text-sm font-semibold text-gray-700 mb-2 inline-flex items-center gap-1"><ShoppingBag size={14} /> Vendas e pedidos</p>
          <DataTable
            colunas={colunasOperacoes}
            itens={operacoesPagina}
            chave={(o: any) => `${o.tipoOperacao}-${o.id}`}
            vazio="Nenhuma venda ou pedido ainda."
            filtros={filtrosOp}
            onFiltrar={aplicarFiltroOp}
            opcoesFiltro={opcoesFiltroOp}
            meta={operacoes.length > 0 ? { total: operacoesFiltradas.length, page: paginaAtualOp, limit: POR_PAGINA, totalPages: totalPaginasOp } : null}
            onPageChange={setPaginaOp}
            onLinhaClick={(o: any) => o.tipoOperacao === 'Venda' && setVendaAberta(o.id)}
            acoes={(o: any) => o.tipoOperacao === 'Venda' ? (
              // stopPropagation: sem isso, o clique no ícone borbulha pro
              // <tr> e o onLinhaClick acima dispara também — abriria o
              // mesmo drawer duas vezes (e empilharia rota se fosse navegação).
              <span onClick={e => e.stopPropagation()}>
                <BotaoIcone titulo="Ver itens da venda" variante="info" onClick={() => setVendaAberta(o.id)}>
                  <Eye size={13} />
                </BotaoIcone>
              </span>
            ) : null}
          />
        </div>

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

      {vendaAberta !== null && (
        <VendaDetalheDrawer tenantSlug={tenantSlug} vendaId={vendaAberta} onClose={() => setVendaAberta(null)} />
      )}
    </div>
  )
}
