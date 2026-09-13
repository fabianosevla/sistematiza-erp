'use client'
// components/modules/crm/VisaoGeralTab.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { fmtMoeda as fmt, fmtDataLocal as fmtData } from '@/lib/format'

interface Props { tenantSlug: string }

const ESTAGIO_LABEL: Record<string, string> = {
  novo: 'Novo', contatado: 'Contatado', negociando: 'Negociando', proposta: 'Proposta',
}

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

  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')
  const { data: clientesData, isLoading: loadingClientes } = useQuery({
    queryKey: ['crm-clientes-lista', tenantSlug, page, search],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/clientes-lista?page=${page}&limit=20&search=${encodeURIComponent(search)}`)).json(),
  })
  const clientes: any[] = clientesData?.data?.data ?? []
  const meta = clientesData?.data?.meta ?? null

  const colunas: Coluna[] = [
    { chave: 'nome', titulo: 'Cliente', principal: true, filtravel: true,
      render: (c: any) => (
        <a href={`/${tenantSlug}/crm/clientes/${c.clienteId}`} className="hover:text-green-700">
          {c.nomeFantasia || c.nome}
        </a>
      ) },
    { chave: 'tipoPessoa', titulo: 'Tipo', largura: 'w-16', esconderAte: 'md' },
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
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Clientes</p>
          <div className="relative max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="pl-8 h-8 text-sm" placeholder="Buscar cliente..." />
          </div>
        </div>
        <DataTable
          colunas={colunas}
          itens={clientes}
          chave={(c: any) => c.clienteId}
          carregando={loadingClientes}
          vazio="Nenhum cliente encontrado."
          meta={meta}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
