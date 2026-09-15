'use client'
// components/modules/crm/SegmentacaoTab.tsx
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Settings } from 'lucide-react'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { InfoTip } from '@/components/ui/InfoTip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SidePanel } from '@/components/ui/SidePanel'
import { useToast } from '@/components/ui/Toast'
import { fmtDataLocal as fmtData } from '@/lib/format'

interface Props { tenantSlug: string }

// Mesmo padrão de paginação do resto do sistema quando a lista inteira já
// vem numa única resposta (ver ClientesTab): fatia no cliente, mas o rodapé
// de paginação é o mesmo componente e o mesmo comportamento de sempre.
const POR_PAGINA = 20

const BALDE_LABEL: Record<string, string> = {
  ativo: 'Ativo', novo: 'Novo', em_risco: 'Em risco', sumindo: 'Sumindo', inativo: 'Inativo', sem_compra: 'Sem compra',
}
const BALDE_COR: Record<string, string> = {
  ativo: 'text-green-700 bg-green-50', novo: 'text-blue-700 bg-blue-50', em_risco: 'text-amber-700 bg-amber-50',
  sumindo: 'text-orange-700 bg-orange-50', inativo: 'text-red-700 bg-red-50', sem_compra: 'text-gray-600 bg-gray-100',
}

export default function SegmentacaoTab({ tenantSlug }: Props) {
  const { toast } = useToast()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['crm-segmentacao', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/segmentacao`)).json(),
  })
  const todos: any[] = data?.data?.linhas ?? []
  const contagem: Record<string, number> = data?.data?.contagem ?? {}

  // Configuração dos limiares de dias — painel lateral, mesmo padrão de
  // formulário do resto do sistema (nunca modal centralizado).
  const [showConfig, setShowConfig] = useState(false)
  const { data: configData } = useQuery({
    queryKey: ['crm-segmentacao-config', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/crm/segmentacao/config`)).json(),
  })
  const limites = configData?.data
  const [form, setForm] = useState({ ativoDias: '30', riscoDias: '60', sumindoDias: '120' })
  useEffect(() => {
    if (!limites) return
    setForm({
      ativoDias:   String(limites.ativoDias),
      riscoDias:   String(limites.riscoDias),
      sumindoDias: String(limites.sumindoDias),
    })
  }, [limites])

  const salvarConfig = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/crm/segmentacao/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ativoDias:   Number(form.ativoDias),
          riscoDias:   Number(form.riscoDias),
          sumindoDias: Number(form.sumindoDias),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-segmentacao', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['crm-segmentacao-config', tenantSlug] })
      setShowConfig(false)
      toast('Configuração salva — segmentação recalculada.')
    },
    onError: (e: any) => toast(e.message ?? 'Erro ao salvar', 'error'),
  })

  // Mesma checagem da rota, pra avisar antes de tentar salvar em vez de só
  // depois que o servidor recusar.
  const ordemValida = Number(form.ativoDias) > 0 && Number(form.riscoDias) > 0 && Number(form.sumindoDias) > 0
    && Number(form.ativoDias) < Number(form.riscoDias) && Number(form.riscoDias) < Number(form.sumindoDias)

  // Mesmo padrão de filtro por coluna do resto do sistema — o balde é só
  // mais uma coluna filtrável, não um controle à parte.
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  const [pagina, setPagina]   = useState(1)
  function aplicarFiltro(chave: string, valor: string) {
    setFiltros(f => {
      const novo = { ...f }
      if (valor) novo[chave] = valor
      else delete novo[chave]
      return novo
    })
    setPagina(1)
  }
  // Ordenação por coluna — lista inteira já carregada, ordena em memória,
  // antes de fatiar pra paginação.
  const [sortKey, setSortKey] = useState('nome')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  function toggleSort(chave: string) {
    if (sortKey === chave) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(chave); setSortDir('asc') }
    setPagina(1)
  }
  function valorDe(l: any, chave: string) {
    return chave === 'balde' ? (BALDE_LABEL[l.balde] ?? l.balde) : l?.[chave]
  }
  const linhas = useMemo(() => {
    const chaves = Object.keys(filtros)
    const base = chaves.length === 0 ? todos
      : todos.filter(l => chaves.every(k => String(valorDe(l, k) ?? '').toLowerCase().includes(filtros[k].toLowerCase())))
    return [...base].sort((a, b) => {
      const av = valorDe(a, sortKey), bv = valorDe(b, sortKey)
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR')
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [todos, filtros, sortKey, sortDir])
  const opcoesFiltro = useMemo(() => {
    const mapa: Record<string, string[]> = {}
    for (const chave of ['nome', 'tipoPessoa']) {
      const set = new Set<string>()
      for (const l of todos) { const v = l?.[chave]; if (v) set.add(String(v)) }
      if (set.size > 0) mapa[chave] = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
    mapa.balde = Object.keys(contagem).filter(b => contagem[b] > 0).map(b => BALDE_LABEL[b] ?? b)
    return mapa
  }, [todos, contagem])

  const totalPaginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA))
  const paginaAtual  = Math.min(pagina, totalPaginas)
  const linhasPagina = linhas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  const colunas: Coluna[] = [
    { chave: 'nome', titulo: 'Cliente', principal: true, filtravel: true, ordenavel: true },
    { chave: 'tipoPessoa', titulo: 'Tipo', largura: 'w-16', esconderAte: 'md', filtravel: true, ordenavel: true },
    { chave: 'qtdCompras', titulo: 'Compras', alinhamento: 'right', esconderAte: 'md', ordenavel: true },
    { chave: 'ultimaCompra', titulo: 'Última compra', ordenavel: true, render: (l: any) => l.ultimaCompra ? fmtData(l.ultimaCompra) : '—' },
    { chave: 'balde', titulo: 'Segmento', filtravel: true, ordenavel: true, render: (l: any) => (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BALDE_COR[l.balde] ?? ''}`}>{BALDE_LABEL[l.balde] ?? l.balde}</span>
    )},
  ]

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 size={20} className="text-gray-300 animate-spin" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {/* SEM tooltip com os dias fixos aqui — virariam mentira no dia em
            que alguém mudasse os números na configuração. Quem quiser saber
            os prazos atuais (ou mudar), abre o painel abaixo — a explicação
            de cada limiar agora mora junto do campo que o edita. */}
        <p className="text-xs text-gray-500">
          Calculado na hora, a partir do histórico de compra — sem cadastro nenhum pra manter. Filtre por segmento clicando no funil da coluna.
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowConfig(true)} className="flex-shrink-0">
          <Settings size={13} className="mr-1.5" /> Configurar prazos
        </Button>
      </div>

      <DataTable
        colunas={colunas}
        itens={linhasPagina}
        chave={(l: any) => l.clienteId}
        vazio="Nenhum cliente nesse segmento."
        filtros={filtros}
        onFiltrar={aplicarFiltro}
        opcoesFiltro={opcoesFiltro}
        ordem={{ chave: sortKey, dir: sortDir }}
        onOrdenar={toggleSort}
        meta={{ total: linhas.length, page: paginaAtual, limit: POR_PAGINA, totalPages: totalPaginas }}
        onPageChange={setPagina}
      />

      {showConfig && (
        <SidePanel
          titulo="Prazos da segmentação"
          subtitulo="Quantos dias sem comprar movem o cliente de balde"
          onClose={() => setShowConfig(false)}
          rodape={
            <>
              <Button variant="outline" onClick={() => setShowConfig(false)}>Cancelar</Button>
              <Button onClick={() => salvarConfig.mutate()} disabled={!ordemValida || salvarConfig.isPending}>
                {salvarConfig.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </>
          }
        >
          <div className="p-6 space-y-4">
            <div>
              <Label className="inline-flex items-center gap-1">
                Dias para virar Ativo
                <InfoTip titulo="Ativo">
                  Cliente com compra dentro desse prazo entra no balde Ativo — ou em Novo,
                  se essa for a única compra que ele já fez.
                </InfoTip>
              </Label>
              <Input value={form.ativoDias} onChange={e => setForm(f => ({ ...f, ativoDias: e.target.value.replace(/\D/g, '') }))}
                inputMode="numeric" className="mt-1" />
            </div>
            <div>
              <Label className="inline-flex items-center gap-1">
                Dias para Em risco
                <InfoTip titulo="Em risco">
                  Além do prazo de Ativo e até este aqui, o cliente entra em Em risco.
                  Precisa ser maior que "Dias para virar Ativo".
                </InfoTip>
              </Label>
              <Input value={form.riscoDias} onChange={e => setForm(f => ({ ...f, riscoDias: e.target.value.replace(/\D/g, '') }))}
                inputMode="numeric" className="mt-1" />
            </div>
            <div>
              <Label className="inline-flex items-center gap-1">
                Dias para Sumindo
                <InfoTip titulo="Sumindo / Inativo">
                  Além do prazo de Em risco e até este aqui, o cliente entra em Sumindo.
                  Além deste (ou se nunca comprou), entra em Inativo. Precisa ser maior
                  que "Dias para Em risco".
                </InfoTip>
              </Label>
              <Input value={form.sumindoDias} onChange={e => setForm(f => ({ ...f, sumindoDias: e.target.value.replace(/\D/g, '') }))}
                inputMode="numeric" className="mt-1" />
            </div>
            {!ordemValida && (
              <p className="text-xs text-red-500">Os prazos precisam crescer: Ativo &lt; Em risco &lt; Sumindo.</p>
            )}
          </div>
        </SidePanel>
      )}
    </div>
  )
}
