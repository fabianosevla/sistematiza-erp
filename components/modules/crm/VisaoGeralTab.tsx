'use client'
// components/modules/crm/VisaoGeralTab.tsx
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { fmtMoeda as fmt, fmtDataLocal as fmtData } from '@/lib/format'

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

export default function VisaoGeralTab({ tenantSlug }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-resumo', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/resumo`)).json(),
  })
  const r = data?.data

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
    return todos.filter(c => chaves.every(k => {
      const v = c?.[k]
      return String(v ?? '').toLowerCase().includes(filtros[k].toLowerCase())
    }))
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

  const colunas: Coluna[] = [
    { chave: 'nome', titulo: 'Cliente', principal: true, filtravel: true,
      render: (c: any) => (
        <a href={`/${tenantSlug}/crm/clientes/${c.clienteId}`} className="hover:text-green-700">
          {c.nomeFantasia || c.nome}
        </a>
      ) },
    { chave: 'tipoPessoa', titulo: 'Tipo', largura: 'w-16', esconderAte: 'md', filtravel: true },
    { chave: 'telefone', titulo: 'Telefone', esconderAte: 'lg', render: (c: any) => c.telefone || '—' },
    { chave: 'qtdCompras', titulo: 'Compras', alinhamento: 'right', esconderAte: 'md' },
    { chave: 'totalGasto', titulo: 'Total gasto', alinhamento: 'right', render: (c: any) => fmt(c.totalGasto) },
    { chave: 'ultimaCompra', titulo: 'Última compra', render: (c: any) => c.ultimaCompra ? fmtData(c.ultimaCompra) : '—' },
  ]

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 size={20} className="text-gray-300 animate-spin" /></div>
  }

  const leadsAbertos = (r?.leadsPorEstagio ?? []).reduce((a: number, l: any) => a + l.qtd, 0)
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

      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-700">Clientes</p>
        <DataTable
          colunas={colunas}
          itens={itensPagina}
          chave={(c: any) => c.clienteId}
          carregando={loadingClientes}
          vazio="Nenhum cliente encontrado."
          filtros={filtros}
          onFiltrar={aplicarFiltro}
          opcoesFiltro={opcoesFiltro}
          meta={{ total: itens.length, page: paginaAtual, limit: POR_PAGINA, totalPages: totalPaginas }}
          onPageChange={setPagina}
        />
      </div>
    </div>
  )
}
