'use client'
// components/modules/crm/ClientesTab.tsx
//
// Fusão de "Visão Geral" + "Clientes" (13/09/2026). Eram duas abas com papéis
// que se encostavam: uma trazia o diretório geral de cliente (tabela
// paginada com KPIs em cima), a outra uma busca rápida por UM cliente com
// prévia do histórico — as duas acabavam sendo "uma tela com cliente",
// só que em lugares diferentes. Nenhuma informação das duas foi perdida
// nessa fusão; cada bloco aqui tem um papel que não se repete:
//
//   1. KPIs + funil B2B          → visão agregada (era "Visão Geral")
//   2. Buscar cliente             → achar UM cliente específico rápido e ver
//                                    a prévia do histórico dele, sem sair da
//                                    tela nem rolar a tabela toda (era "Clientes")
//   3. Todos os clientes          → diretório completo, paginado e filtrável
//                                    (era a tabela de "Visão Geral")
//
// O link "Ver ficha 360° completa" (item 2) e o nome do cliente na tabela
// (item 3) levam pro mesmo lugar: app/(dashboard)/[tenant]/crm/clientes/[id]
// → Ficha360View.tsx.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ChevronDown, Eye, Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import VendaDetalheDrawer from '@/components/modules/vendas/VendaDetalheDrawer'
import { fmtMoeda as fmt, fmtDataLocal as fmtData, fmtDataHoraLocal as fmtDataHora } from '@/lib/format'

interface Props { tenantSlug: string }

const ESTAGIO_LABEL: Record<string, string> = {
  novo: 'Novo', contatado: 'Contatado', negociando: 'Negociando', proposta: 'Proposta',
}

// Mesmo padrão de filtro por coluna do resto do sistema (ver ConsultasView):
// funil no cabeçalho, opções sempre do conjunto SEM filtro, filtro e
// paginação no cliente — nada de caixa de busca solta acima da tabela.
const POR_PAGINA = 20

function Card({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{valor}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function ClientesTab({ tenantSlug }: Props) {
  const router = useRouter()

  // Detalhe de venda em painel lateral (mesmo padrão de ConsultasView) —
  // usado tanto na prévia do cliente escolhido quanto, futuramente, em
  // qualquer lugar desta tela que precise mostrar itens de uma venda.
  const [vendaAberta, setVendaAberta] = useState<number | null>(null)

  // ── 1. Visão agregada — KPIs + funil B2B ─────────────────────────────────
  const { data: resumoData, isLoading: loadingResumo } = useQuery({
    queryKey: ['crm-resumo', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/resumo`)).json(),
  })
  const r = resumoData?.data

  // ── 3. Diretório geral — tabela paginada/filtrada ────────────────────────
  const [pagina, setPagina] = useState(1)
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  const { data: clientesData, isLoading: loadingClientes } = useQuery({
    queryKey: ['crm-clientes-lista', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/clientes-lista?page=1&limit=1000`)).json(),
  })
  const todos: any[] = clientesData?.data?.data ?? []

  function aplicarFiltro(chave: string, valor: string) {
    setFiltros(f => {
      const novo = { ...f }
      if (valor) novo[chave] = valor
      else delete novo[chave]
      return novo
    })
    setPagina(1)
  }
  const itens = useMemo(() => {
    const chaves = Object.keys(filtros)
    if (chaves.length === 0) return todos
    return todos.filter(c => chaves.every(k => String(c?.[k] ?? '').toLowerCase().includes(filtros[k].toLowerCase())))
  }, [todos, filtros])
  // Opções do funil: sempre do conjunto sem filtro, senão escolher um valor
  // apaga a chance de trocar pra outro sem limpar antes.
  const opcoesFiltro = useMemo(() => {
    const mapa: Record<string, string[]> = {}
    for (const chave of ['nome', 'tipoPessoa']) {
      const set = new Set<string>()
      for (const c of todos) { const v = c?.[chave]; if (v) set.add(String(v)) }
      if (set.size > 0) mapa[chave] = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
    return mapa
  }, [todos])
  const totalPaginas = Math.max(1, Math.ceil(itens.length / POR_PAGINA))
  const paginaAtual  = Math.min(pagina, totalPaginas)
  const itensPagina  = itens.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  const colunasDiretorio: Coluna[] = [
    // Texto simples, não <a>: a linha inteira já navega (onLinhaClick logo
    // abaixo) — um link de verdade aqui dispararia navegação nativa por
    // cima do router.push do clique na linha, competindo com ele.
    { chave: 'nome', titulo: 'Cliente', principal: true, filtravel: true,
      render: (c: any) => <span className="group-hover:text-green-700">{c.nomeFantasia || c.nome}</span> },
    { chave: 'tipoPessoa', titulo: 'Tipo', largura: 'w-16', esconderAte: 'md', filtravel: true },
    { chave: 'telefone', titulo: 'Telefone', esconderAte: 'lg', render: (c: any) => c.telefone || '—' },
    { chave: 'qtdCompras', titulo: 'Compras', alinhamento: 'right', esconderAte: 'md' },
    { chave: 'totalGasto', titulo: 'Total gasto', alinhamento: 'right', render: (c: any) => fmt(c.totalGasto) },
    { chave: 'ultimaCompra', titulo: 'Última compra', render: (c: any) => c.ultimaCompra ? fmtData(c.ultimaCompra) : '—' },
  ]

  // ── 2. Busca rápida — combobox + prévia do cliente escolhido ─────────────
  const [termo, setTermo]             = useState('')
  const [aberto, setAberto]           = useState(false)
  const [selecionado, setSelecionado] = useState<any | null>(null)
  const caixaRef = useRef<HTMLDivElement>(null)

  const { data: buscaData, isLoading: loadingBusca } = useQuery({
    queryKey: ['crm-busca-cliente', tenantSlug, termo],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/clientes?termo=${encodeURIComponent(termo)}`)).json(),
  })
  const resultados: any[] = buscaData?.data?.resultados ?? []

  // Fecha ao clicar fora — mesma ideia do funil de coluna do DataTable, só
  // que sem portal: o combobox aqui não vive dentro de área que rola.
  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const { data: fichaData, isLoading: loadingFicha } = useQuery({
    queryKey: ['crm-ficha360-preview', tenantSlug, selecionado?.clienteId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/clientes/${selecionado.clienteId}`)).json(),
    enabled:  !!selecionado,
  })
  const ficha = fichaData?.data
  const vendasSel: any[] = ficha?.vendas ?? []

  const [filtrosVendasSel, setFiltrosVendasSel] = useState<Record<string, string>>({})
  const [paginaVendasSel, setPaginaVendasSel]   = useState(1)
  function aplicarFiltroVendasSel(chave: string, valor: string) {
    setFiltrosVendasSel(f => {
      const novo = { ...f }
      if (valor) novo[chave] = valor
      else delete novo[chave]
      return novo
    })
    setPaginaVendasSel(1)
  }
  const vendasSelFiltradas = useMemo(() => {
    const chaves = Object.keys(filtrosVendasSel)
    if (chaves.length === 0) return vendasSel
    return vendasSel.filter(v => chaves.every(k => String(v?.[k] ?? '').toLowerCase().includes(filtrosVendasSel[k].toLowerCase())))
  }, [vendasSel, filtrosVendasSel])
  const opcoesVendasSel = useMemo(() => {
    const mapa: Record<string, string[]> = {}
    for (const chave of ['origem', 'status']) {
      const set = new Set<string>()
      for (const v of vendasSel) { const val = v?.[chave]; if (val) set.add(String(val)) }
      if (set.size > 0) mapa[chave] = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
    return mapa
  }, [vendasSel])
  const totalPaginasVendasSel = Math.max(1, Math.ceil(vendasSelFiltradas.length / POR_PAGINA))
  const paginaAtualVendasSel  = Math.min(paginaVendasSel, totalPaginasVendasSel)
  const vendasSelPagina       = vendasSelFiltradas.slice((paginaAtualVendasSel - 1) * POR_PAGINA, paginaAtualVendasSel * POR_PAGINA)

  const colunasVendasSel: Coluna[] = [
    { chave: 'vendaId', titulo: 'Venda', largura: 'w-20', render: (v: any) => <span className="font-mono text-xs text-gray-500">#{v.vendaId}</span> },
    { chave: 'vendidaEm', titulo: 'Data', render: (v: any) => fmtDataHora(v.vendidaEm) },
    { chave: 'origem', titulo: 'Origem', esconderAte: 'md', filtravel: true, render: (v: any) => <Badge variant="outline">{v.origem}</Badge> },
    { chave: 'status', titulo: 'Status', esconderAte: 'md', filtravel: true },
    { chave: 'total', titulo: 'Total', alinhamento: 'right', render: (v: any) => <span className="font-semibold">{fmt(v.total)}</span> },
  ]

  function escolher(c: any) {
    setSelecionado(c)
    setTermo('')
    setAberto(false)
    setFiltrosVendasSel({})
    setPaginaVendasSel(1)
    setVendaAberta(null)
  }

  if (loadingResumo) {
    return <div className="flex justify-center py-12"><Loader2 size={20} className="text-gray-300 animate-spin" /></div>
  }

  const leadsAbertos  = (r?.leadsPorEstagio ?? []).reduce((a: number, l: any) => a + l.qtd, 0)
  const valorEmAberto = (r?.leadsPorEstagio ?? []).reduce((a: number, l: any) => a + l.valorEstimado, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Clientes ativos (90 dias)" valor={String(r?.clientesAtivos ?? 0)} />
        <Card label="Ticket médio (30 dias)" valor={fmt(r?.ticketMedio ?? 0)} />
        <Card label="Leads em aberto" valor={String(leadsAbertos)} sub={valorEmAberto > 0 ? `${fmt(valorEmAberto)} estimados` : undefined} />
        <Card label="Cardápio hoje" valor={`${r?.cardapioHoje?.visualizacoes ?? 0} visualizações`} sub={`${r?.cardapioHoje?.pedidosMontados ?? 0} pedidos montados`} />
      </div>

      {leadsAbertos > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Funil B2B — leads por estágio</p>
          <div className="flex flex-wrap gap-3">
            {(r?.leadsPorEstagio ?? []).map((l: any) => (
              <div key={l.estagio} className="flex-1 min-w-[140px] bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">{ESTAGIO_LABEL[l.estagio] ?? l.estagio}</p>
                <p className="text-lg font-semibold text-gray-900">{l.qtd}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Busca rápida — achar UM cliente sem rolar o diretório inteiro lá
          embaixo nem digitar no funil da coluna Cliente. z-30 no dropdown:
          tem que ficar por cima do cabeçalho da tabela de vendas logo abaixo
          (esse cabeçalho é sticky com z-20 — com o mesmo z-index os dois
          empatam, e quem vem depois no HTML ganha, que é a tabela). */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-700">Buscar cliente</p>
        <div ref={caixaRef} className="relative max-w-md">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <Input
              value={aberto ? termo : (selecionado ? (selecionado.nomeFantasia || selecionado.nome) : '')}
              onChange={e => { setTermo(e.target.value); setAberto(true) }}
              onFocus={() => { setTermo(''); setAberto(true) }}
              className="pl-9 pr-8 h-9"
              placeholder="Selecionar cliente..."
            />
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
          </div>

          {aberto && (
            <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
              {loadingBusca ? (
                <p className="text-sm text-gray-400 text-center py-4">Carregando...</p>
              ) : resultados.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum cliente encontrado.</p>
              ) : (
                resultados.map(c => (
                  <button key={c.clienteId} type="button" onClick={() => escolher(c)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.nomeFantasia || c.nome}</p>
                    <p className="text-xs text-gray-400 truncate">{c.documento || (c.tipoPessoa === 'PJ' ? 'PJ' : 'PF')}{c.cidade ? ` · ${c.cidade}/${c.uf}` : ''}</p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {selecionado && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              {ficha ? (
                <p className="text-sm text-gray-500">
                  Saldo cashback: <span className="font-semibold text-gray-900">{fmt(ficha.resumo.saldoCashback)}</span>
                  {' · '}Total gasto: <span className="font-semibold text-gray-900">{fmt(ficha.resumo.totalGasto)}</span>
                </p>
              ) : (
                <span className="text-sm text-gray-400">Carregando...</span>
              )}
              <a href={`/${tenantSlug}/crm/clientes/${selecionado.clienteId}`} className="text-xs text-green-600 hover:text-green-700 font-medium">
                Ver ficha 360° completa →
              </a>
            </div>
            <DataTable
              colunas={colunasVendasSel}
              itens={vendasSelPagina}
              chave={(v: any) => v.vendaId}
              carregando={loadingFicha}
              vazio="Esse cliente ainda não tem venda registrada."
              filtros={filtrosVendasSel}
              onFiltrar={aplicarFiltroVendasSel}
              opcoesFiltro={opcoesVendasSel}
              meta={vendasSel.length > 0 ? { total: vendasSelFiltradas.length, page: paginaAtualVendasSel, limit: POR_PAGINA, totalPages: totalPaginasVendasSel } : null}
              onPageChange={setPaginaVendasSel}
              onLinhaClick={(v: any) => setVendaAberta(v.vendaId)}
              acoes={(v: any) => (
                // stopPropagation: sem isso, o clique no ícone borbulha pro
                // <tr> e dispara onLinhaClick também — abriria o mesmo
                // drawer duas vezes.
                <span onClick={e => e.stopPropagation()}>
                  <BotaoIcone titulo="Ver itens da venda" variante="info" onClick={() => setVendaAberta(v.vendaId)}>
                    <Eye size={13} />
                  </BotaoIcone>
                </span>
              )}
            />
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-700">Todos os clientes</p>
        <DataTable
          colunas={colunasDiretorio}
          itens={itensPagina}
          chave={(c: any) => c.clienteId}
          carregando={loadingClientes}
          vazio="Nenhum cliente encontrado."
          filtros={filtros}
          onFiltrar={aplicarFiltro}
          opcoesFiltro={opcoesFiltro}
          meta={{ total: itens.length, page: paginaAtual, limit: POR_PAGINA, totalPages: totalPaginas }}
          onPageChange={setPagina}
          onLinhaClick={(c: any) => router.push(`/${tenantSlug}/crm/clientes/${c.clienteId}`)}
          acoes={(c: any) => (
            // stopPropagation: sem isso, o clique no ícone borbulha pro
            // <tr> e dispara onLinhaClick também — empilharia a mesma
            // navegação duas vezes no histórico do navegador.
            <span onClick={e => e.stopPropagation()}>
              <BotaoIcone titulo="Ver ficha 360°" variante="info" onClick={() => router.push(`/${tenantSlug}/crm/clientes/${c.clienteId}`)}>
                <Eye size={13} />
              </BotaoIcone>
            </span>
          )}
        />
      </div>

      {vendaAberta !== null && (
        <VendaDetalheDrawer tenantSlug={tenantSlug} vendaId={vendaAberta} onClose={() => setVendaAberta(null)} />
      )}
    </div>
  )
}
