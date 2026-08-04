'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Factory, AlertTriangle, CheckCircle, X, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/InfoTip'
import { useToast } from '@/components/ui/Toast'
import { FormModal } from '@/components/ui/FormModal'
import { fmtQtd, fmtDataCurta as fmtDate } from '@/lib/format'

interface Props { tenantSlug: string }

function getWeekDates(offset = 0) {
  const now = new Date()
  const day = now.getDay()
  const mon = new Date(now)
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d
  })
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const HOJE = new Date().toISOString().slice(0, 10)

type CelulaKey = { produtoId: number; data: string; tipo: 'producao' | 'pedido' }

// Célula de PP que ainda não foi registrada — é o que o botão vai lançar.
// Precisa ser tipada porque `produtos` vem da API como any e o TS não
// consegue inferir o item do flatMap sozinho.
interface CelulaPendente {
  produtoId:  number
  nome:       string
  unidade:    string
  data:       string
  quantidade: number
}

export default function ProducaoView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()

  const [weekOffset, setWeekOffset]         = useState(0)
  const [editandoCelula, setEditandoCelula] = useState<CelulaKey | null>(null)
  const [valorCelula, setValorCelula]       = useState('')
  const [showPrevisao, setShowPrevisao]     = useState(false)
  const [showRegistro, setShowRegistro]     = useState(false)
  // Dias marcados no modal. Vazio = nada será registrado.
  const [diasSelecionados, setDiasSelecionados] = useState<string[]>([])
  const [ciente, setCiente]                 = useState(false)

  const dias   = getWeekDates(weekOffset)
  const inicio = isoDate(dias[0])
  const fim    = isoDate(dias[5])

  const { data: gradeData } = useQuery({
    queryKey: ['producao-grade', tenantSlug, inicio, fim],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/producao/grade?inicio=${inicio}&fim=${fim}`)).json(),
  })

  // Células já lançadas: viram cinza e param de aceitar edição.
  const { data: registrosData } = useQuery({
    queryKey: ['producao-registros', tenantSlug, inicio, fim],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/producao/registrar?inicio=${inicio}&fim=${fim}`)).json(),
  })

  const { data: previsaoData } = useQuery({
    queryKey: ['producao-previsao', tenantSlug, inicio, fim],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/producao/previsao?inicio=${inicio}&fim=${fim}`)).json(),
    enabled:  showPrevisao,
  })

  // Previsão semanal necessária — média histórica de todos os meses anteriores ÷ 4
  const { data: prevSemanalData } = useQuery({
    queryKey: ['previsao-semanal', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/metas?tipo=previsao&mes=${new Date().getMonth() + 1}&ano=${new Date().getFullYear()}&mesesHistorico=12`)).json(),
    staleTime: 300000,
  })

  const salvarCelulaMut = useMutation({
    mutationFn: ({ produtoId, data, quantidade, tipo }: any) => fetch(`/api/${tenantSlug}/producao/grade`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ produtoId, dataProducao: data, quantidade: Number(quantidade), tipo }),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['producao-grade', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['producao-previsao', tenantSlug] })
    },
  })

  const grade      = gradeData?.data ?? gradeData ?? {}
  const produtos   = Array.isArray(grade.produtos) ? grade.produtos : []
  const celulas    = grade.grade ?? {}     // grade[produtoId][data] = qtd produção
  const celulasPed = grade.pedidos ?? {}   // pedidos[produtoId][data] = qtd pedido

  // registrados[produtoId][data] = { planejada, produzida, ... }
  const registrados = registrosData?.data?.porProdutoData ?? {}
  function jaRegistrada(produtoId: number, data: string) {
    return !!registrados?.[produtoId]?.[data]
  }

  const previsao = Array.isArray(previsaoData?.data?.itens) ? previsaoData.data.itens
    : Array.isArray(previsaoData?.data)  ? previsaoData.data
    : Array.isArray(previsaoData?.itens) ? previsaoData.itens
    : Array.isArray(previsaoData) ? previsaoData : []

  const prevSemanal: Record<number, number> = {}
  for (const p of (prevSemanalData?.data?.produtos ?? [])) {
    prevSemanal[p.produtoId] = Math.ceil((p.mediaVendas ?? 0) / 4)
  }

  // ── Células pendentes de registro ────────────────────────────────────────
  // Entram apenas dias que já aconteceram (até hoje). O que está planejado
  // para os próximos dias continua editável e fora do lançamento — não faz
  // sentido dar baixa de insumo de uma produção que ainda não ocorreu.
  const pendentes: CelulaPendente[] = produtos.flatMap((p: any) =>
    dias
      .map(d => isoDate(d))
      .filter((d: string) => d <= HOJE)
      .map((d: string): CelulaPendente => ({
        produtoId:  p.produtoId,
        nome:       p.nome,
        unidade:    p.unidade,
        data:       d,
        quantidade: celulas?.[p.produtoId]?.[d] ?? 0,
      }))
      .filter((c: CelulaPendente) => c.quantidade > 0 && !jaRegistrada(c.produtoId, c.data))
  )

  // Dias que têm algo a registrar, com o resumo de cada um. É essa lista que
  // vira a seleção por checkbox dentro do modal.
  const diasComPendencia = dias
    .map(d => isoDate(d))
    .filter((d: string) => d <= HOJE)
    .map((d: string) => {
      const doDia = pendentes.filter(c => c.data === d)
      return {
        data:     d,
        produtos: doDia.length,
        total:    doDia.reduce((a, c) => a + c.quantidade, 0),
      }
    })
    .filter(d => d.produtos > 0)

  // Só o que está marcado é enviado. A prévia recalcula sozinha a cada
  // mudança na seleção, porque a chave da query inclui os itens escolhidos.
  const itensSelecionados = pendentes
    .filter(c => diasSelecionados.includes(c.data))
    .map(c => ({ produtoId: c.produtoId, dataProducao: c.data, quantidade: c.quantidade }))

  const { data: previaRaw, isFetching: carregandoPrevia } = useQuery({
    queryKey: ['producao-previa-lote', tenantSlug, JSON.stringify(itensSelecionados)],
    queryFn:  async () => {
      const res = await fetch(`/api/${tenantSlug}/producao/registrar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmar: false, itens: itensSelecionados }),
      })
      return res.json()
    },
    enabled: showRegistro && itensSelecionados.length > 0,
  })
  const previaLote = previaRaw?.data ?? previaRaw ?? null

  function abrirRegistro() {
    if (diasComPendencia.length === 0) {
      toast('Nada a registrar: os dias até hoje já foram lançados ou estão zerados.')
      return
    }
    // Abre com o dia de hoje marcado, se houver — é o uso do dia a dia.
    // Os outros ficam disponíveis para recuperar um dia esquecido.
    const temHoje = diasComPendencia.some(d => d.data === HOJE)
    setDiasSelecionados(temHoje ? [HOJE] : [])
    setCiente(false)
    setShowRegistro(true)
  }

  function alternarDia(data: string) {
    setCiente(false)
    setDiasSelecionados(prev =>
      prev.includes(data) ? prev.filter(d => d !== data) : [...prev, data]
    )
  }

  function fecharRegistro() {
    setShowRegistro(false)
    setDiasSelecionados([])
    setCiente(false)
  }

  const confirmarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/producao/registrar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmar: true, itens: itensSelecionados }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao registrar produção')
      return d?.data ?? d
    },
    onSuccess: (d) => {
      toast(d?.message ?? 'Produção registrada!')
      fecharRegistro()
      qc.invalidateQueries({ queryKey: ['producao-registros', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['producao-grade', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['producao-previsao', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['estoque-produtos', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['estoque-insumos', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['estoque-kpis', tenantSlug] })
    },
    onError: (e: any) => toast(e?.message ?? 'Erro ao registrar produção.', 'error'),
  })

  function iniciarEdicao(produtoId: number, data: string, tipo: 'producao' | 'pedido', valorAtual: number) {
    if (jaRegistrada(produtoId, data)) return
    setEditandoCelula({ produtoId, data, tipo })
    setValorCelula(String(valorAtual || ''))
  }

  function salvarCelula(produtoId: number, data: string, tipo: 'producao' | 'pedido') {
    salvarCelulaMut.mutate({ produtoId, data, quantidade: valorCelula || '0', tipo })
    setEditandoCelula(null)
  }

  // Célula de PP. Depois de registrada fica cinza claro e some o clique —
  // é o sinal visual de que aquele dia já baixou insumo e entrou no estoque.
  function CelulaEditavel({ produtoId, data, valor }: { produtoId: number; data: string; valor: number }) {
    const travada = jaRegistrada(produtoId, data)
    const isEdit  = editandoCelula?.produtoId === produtoId && editandoCelula?.data === data && editandoCelula?.tipo === 'producao'

    if (travada) {
      const reg = registrados[produtoId][data]
      return (
        <span
          title={`Registrado: ${fmtQtd(reg.produzida)} — insumo já debitado`}
          className="inline-flex items-center justify-center w-10 h-6 rounded text-xs font-medium bg-gray-100 text-gray-400 cursor-not-allowed">
          {reg.produzida > 0 ? fmtQtd(reg.produzida) : '—'}
        </span>
      )
    }

    if (isEdit) {
      return (
        <input type="number" min="0" value={valorCelula}
          onChange={e => setValorCelula(e.target.value)}
          onBlur={() => salvarCelula(produtoId, data, 'producao')}
          onKeyDown={e => {
            if (e.key === 'Enter') salvarCelula(produtoId, data, 'producao')
            if (e.key === 'Escape') setEditandoCelula(null)
          }}
          className="w-10 h-6 text-center text-xs border border-green-400 rounded focus:outline-none" autoFocus />
      )
    }

    return (
      <button onClick={() => iniciarEdicao(produtoId, data, 'producao', valor)}
        className={`w-10 h-6 rounded text-xs font-medium transition-colors ${
          valor > 0 ? 'bg-green-100 text-green-700 hover:opacity-80' : 'text-gray-200 hover:bg-gray-100'
        }`}>
        {valor > 0 ? valor : '—'}
      </button>
    )
  }

  function CelulaPedido({ valor }: { valor: number }) {
    return (
      <span className={`inline-flex items-center justify-center w-10 h-6 rounded text-xs font-medium ${
        valor > 0 ? 'bg-blue-100 text-blue-700' : 'text-gray-200'
      }`}>
        {valor > 0 ? valor : '—'}
      </span>
    )
  }

  const totaisPedDia: Record<string, number> = {}
  const totaisPrevDia: Record<string, number> = {}
  for (const dia of dias) {
    const d = isoDate(dia)
    totaisPedDia[d]  = produtos.reduce((a: number, p: any) => a + (celulasPed?.[p.produtoId]?.[d] ?? 0), 0)
    totaisPrevDia[d] = produtos.reduce((a: number, p: any) => {
      const reg = registrados?.[p.produtoId]?.[d]
      return a + (reg ? Number(reg.produzida) : (celulas?.[p.produtoId]?.[d] ?? 0))
    }, 0)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Produção</h1>
          <p className="text-sm text-gray-400 mt-0.5">{fmtDate(dias[0])} – {fmtDate(dias[5])}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPrevisao(!showPrevisao)}>
            {showPrevisao ? 'Ocultar Previsão Insumos' : 'Ver Previsão de Insumos'}
          </Button>
          <InfoTip titulo="Registrar produção">
            Abre a lista dos dias com produção pendente. Você marca quais quer lançar —
            dá para registrar hoje e recuperar um dia esquecido na mesma operação.
            <br /><br />
            Para cada célula dos dias marcados: os insumos da ficha são debitados e a
            quantidade entra no estoque do produto.
            <br /><br />
            A quantidade da célula é o que <strong>de fato</strong> foi produzido — se o plano
            era 50 e saíram 52, corrija a célula para 52 antes de registrar.
            <br /><br />
            Célula registrada fica cinza e não aceita mais edição. Dias futuros não aparecem
            na lista.
          </InfoTip>
          <Button onClick={abrirRegistro}>
            <Factory size={14} className="mr-1.5" />
            Registrar Produção{diasComPendencia.length > 0 ? ` (${diasComPendencia.length})` : ''}
          </Button>
        </div>
      </div>

      {/* Navegação semana */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft size={16} /></button>
        <span className="text-sm font-medium text-gray-700 min-w-48 text-center">
          {dias[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} – {dias[5].toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </span>
        <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronRight size={16} /></button>
        {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="text-xs text-blue-600 hover:underline">Esta semana</button>}
      </div>

      {/* Grade */}
      {/* A rolagem vertical acontece AQUI dentro, não na página.
          É o que permite o cabeçalho ficar fixo: `sticky top-0` gruda no
          contêiner que rola, e um contêiner com overflow-x já rola nos dois
          eixos. Sem a altura máxima, quem rolaria seria a janela e o
          cabeçalho subiria junto com as linhas. */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-260px)] min-h-[240px]">
          <table className="w-full min-w-max text-xs">
            <thead>
              {/* Cada célula do cabeçalho precisa de fundo próprio e z-index:
                  transparente deixaria as linhas passarem por baixo.
                  O canto (Produto) é fixo nos dois eixos, por isso z maior. */}
              <tr className="bg-gray-50">
                <th className="sticky top-0 left-0 z-30 text-left text-xs font-medium text-gray-500 px-3 py-2 w-56 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb]">Produto</th>
                <th className="sticky top-0 z-20 text-center text-xs font-medium text-gray-500 px-2 py-2 w-16 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb]">Estoque</th>
                {DIAS.map((d, i) => (
                  <th key={d} className="sticky top-0 z-20 text-center text-xs font-medium text-gray-400 px-0 py-1 bg-gray-50 border-b border-gray-200" colSpan={2}>
                    <div className="font-semibold text-gray-600">{d}</div>
                    <div className="text-[10px] text-gray-400">{fmtDate(dias[i])}</div>
                    <div className="grid grid-cols-2 text-[9px] text-gray-300 mt-0.5">
                      <span className="text-blue-400">Ped</span>
                      <span className="text-green-500">PP</span>
                    </div>
                  </th>
                ))}
                <th className="sticky top-0 z-20 text-center text-xs font-medium text-blue-600 px-2 py-2 w-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb]">Total Ped.</th>
                <th className="sticky top-0 z-20 text-center text-xs font-medium text-gray-500 px-2 py-2 w-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb]">Prev. Est.</th>
                <th className="sticky top-0 z-20 text-center text-xs font-bold text-orange-600 px-2 py-2 w-24 bg-orange-50 shadow-[inset_0_-1px_0_#e5e7eb]">Prod. Semanal Necessária</th>
              </tr>
            </thead>
            <tbody>
              {produtos.length === 0 ? (
                <tr><td colSpan={3 + DIAS.length * 2 + 3} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum produto cadastrado.</td></tr>
              ) : produtos.map((p: any) => {
                const estoque = p.estoqueAtual ?? 0
                let totalPed = 0, totalPrev = 0

                return (
                  <tr key={p.produtoId} className="border-b border-gray-50 hover:bg-gray-50/30 last:border-0">
                    {/* Nome quebra em até duas linhas em vez de ser cortado com
                        reticências. A linha cresce junto, o que também deixa a
                        grade mais legível. O title mostra o nome inteiro. */}
                    <td
                      title={p.nome}
                      className="px-3 py-3 text-xs font-medium text-gray-900 sticky left-0 z-10 bg-white align-middle w-56 max-w-[224px] leading-snug">
                      {p.nome}
                    </td>
                    <td className="px-2 py-3 text-center align-middle">
                      <span className={`text-sm font-semibold ${estoque <= (p.estoqueMinimo ?? 0) ? 'text-red-600' : 'text-gray-700'}`}>{estoque}</span>
                    </td>
                    {dias.map(dia => {
                      const d    = isoDate(dia)
                      const ped  = celulasPed?.[p.produtoId]?.[d] ?? 0
                      const reg  = registrados?.[p.produtoId]?.[d]
                      const prev = reg ? Number(reg.produzida) : (celulas?.[p.produtoId]?.[d] ?? 0)
                      totalPed  += ped
                      totalPrev += prev
                      return (
                        <td key={`dia-${d}`} className="px-0 py-2 align-middle" colSpan={2}>
                          <div className="grid grid-cols-2">
                            <span className="text-center"><CelulaPedido valor={ped} /></span>
                            <span className="text-center">
                              <CelulaEditavel produtoId={p.produtoId} data={d} valor={celulas?.[p.produtoId]?.[d] ?? 0} />
                            </span>
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-2 py-3 text-center align-middle">
                      <span className={`text-sm font-semibold ${totalPed > 0 ? 'text-blue-700' : 'text-gray-200'}`}>{totalPed > 0 ? totalPed : '—'}</span>
                    </td>
                    <td className="px-2 py-3 text-center align-middle">
                      {(() => {
                        const prevEst = estoque + totalPrev - totalPed
                        return <span className={`text-sm font-semibold ${prevEst < 0 ? 'text-red-600' : 'text-gray-700'}`}>{prevEst}</span>
                      })()}
                    </td>
                    <td className="px-2 py-3 text-center align-middle bg-orange-50">
                      {(() => {
                        const ps = prevSemanal[p.produtoId] ?? 0
                        return <span className={`text-sm font-bold ${ps > 0 ? 'text-orange-600' : 'text-gray-300'}`}>{ps > 0 ? ps : '—'}</span>
                      })()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {produtos.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-3 py-3 text-xs font-bold text-gray-600 sticky left-0 z-10 bg-gray-50">Total Geral ({produtos.length})</td>
                  <td className="px-2 py-3 text-center text-sm font-bold text-gray-700">
                    {produtos.reduce((a: number, p: any) => a + (p.estoqueAtual ?? 0), 0)}
                  </td>
                  {dias.map(dia => {
                    const d = isoDate(dia)
                    return (
                      <td key={`tot-${d}`} className="px-0 py-2" colSpan={2}>
                        <div className="grid grid-cols-2">
                          <span className="text-center text-xs font-bold text-blue-600">{totaisPedDia[d] > 0 ? totaisPedDia[d] : '—'}</span>
                          <span className="text-center text-xs font-bold text-green-600">{totaisPrevDia[d] > 0 ? totaisPrevDia[d] : '—'}</span>
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-2 py-2 text-center text-xs font-bold text-blue-700">
                    {Object.values(totaisPedDia).reduce((a: number, v) => a + v, 0) || '—'}
                  </td>
                  <td className="px-2 py-2 text-center text-xs text-gray-400">—</td>
                  <td className="px-2 py-2 text-center text-xs font-bold text-orange-600 bg-orange-50">
                    {Object.values(prevSemanal).reduce((a, v) => a + v, 0) || '—'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="px-4 py-2 border-t border-gray-100 flex gap-4 flex-wrap text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 inline-block" /> Pedido (Ped) — dos Pedidos, somente leitura</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 inline-block" /> Produção (PP) — editável</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 inline-block" /> Registrada — insumo debitado, estoque somado</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-100 inline-block" /> Necessária = média histórica ÷ 4</span>
        </div>
      </div>

      {/* Previsão de Insumos */}
      {showPrevisao && (
        <div className="mt-4 bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Previsão de Insumos — semana atual</h3>
          </div>
          {previsao.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Sem produção planejada ou fichas técnicas não cadastradas.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Insumo', 'Necessário', 'Estoque Atual', 'Situação'].map((h, i) => (
                    <th key={h} className={`${i === 0 ? 'text-left' : 'text-center'} text-xs font-medium text-gray-400 px-4 py-3`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previsao.map((item: any, i: number) => (
                  <tr key={i} className={`border-b border-gray-50 ${!item.suficiente ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{item.nomeInsumo ?? item.nome}</td>
                    <td className="px-4 py-2.5 text-center text-sm text-gray-600">{fmtQtd(item.totalNecessario ?? item.necessario ?? 0)} {item.unidade}</td>
                    <td className="px-4 py-2.5 text-center text-sm">
                      <span className={item.suficiente ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                        {fmtQtd(item.estoqueAtual ?? item.emEstoque ?? 0)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {item.suficiente
                        ? <span className="text-xs text-green-600 flex items-center justify-center gap-1"><CheckCircle size={12} /> OK</span>
                        : <span className="text-xs text-red-600 flex items-center justify-center gap-1"><AlertTriangle size={12} /> Insuficiente</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal — confirmação do registro em lote */}
      {showRegistro && (
        <FormModal
          titulo="Registrar Produção"
          onClose={fecharRegistro}
          largura="max-w-2xl"
          cabecalho={
            <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
              <Lock size={9} /> irreversível
            </span>
          }
        >
          <div className="p-6 space-y-5">

            {/* Seleção de dias — uma linha por dia com pendência */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dias a registrar</p>
                <InfoTip titulo="Seleção de dias">
                  Só os dias marcados são lançados. Dias já registrados e dias futuros não
                  aparecem aqui.
                </InfoTip>
              </div>
              <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {diasComPendencia.map(d => {
                  const marcado = diasSelecionados.includes(d.data)
                  const rotulo  = DIAS[dias.findIndex(x => isoDate(x) === d.data)] ?? ''
                  return (
                    <label
                      key={d.data}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                        marcado ? 'bg-green-50/60' : 'hover:bg-gray-50'
                      }`}>
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alternarDia(d.data)}
                        className="w-4 h-4 rounded" />
                      <span className="text-sm font-medium text-gray-900 w-28">
                        {rotulo} {fmtDate(d.data)}
                        {d.data === HOJE && <span className="ml-1.5 text-[10px] text-green-600 font-semibold">hoje</span>}
                      </span>
                      <span className="text-xs text-gray-500 flex-1">
                        {d.produtos} produto{d.produtos > 1 ? 's' : ''}
                      </span>
                      <span className="text-xs font-semibold text-gray-700">{fmtQtd(d.total)} un</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {itensSelecionados.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                Marque ao menos um dia para ver o que será lançado.
              </p>
            ) : carregandoPrevia ? (
              <p className="text-sm text-gray-400 text-center py-8">Calculando...</p>
            ) : !previaLote ? (
              <p className="text-sm text-gray-400 text-center py-8">Nada a registrar.</p>
            ) : (
              <>
                {previaLote.semFicha?.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-sm text-red-700">
                      Sem ficha técnica: {previaLote.semFicha.join(', ')}. Cadastre a ficha antes de registrar.
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Entra no estoque
                  </p>
                  <table className="w-full border border-gray-100 rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left   text-xs font-medium text-gray-400 px-3 py-2">Produto</th>
                        <th className="text-center text-xs font-medium text-gray-400 px-3 py-2">Data</th>
                        <th className="text-right  text-xs font-medium text-gray-400 px-3 py-2">Quantidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previaLote.produtos?.map((p: any, i: number) => (
                        <tr key={i} className="border-t border-gray-50">
                          <td className="px-3 py-2 text-sm font-medium text-gray-900">{p.nome}</td>
                          <td className="px-3 py-2 text-center text-sm text-gray-500">{fmtDate(p.dataProducao)}</td>
                          <td className="px-3 py-2 text-right text-sm font-semibold text-green-700">
                            +{fmtQtd(p.quantidade)} {p.unidade}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Sai do estoque
                  </p>
                  <table className="w-full border border-gray-100 rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left   text-xs font-medium text-gray-400 px-3 py-2">Insumo</th>
                        <th className="text-right  text-xs font-medium text-gray-400 px-3 py-2">Consumo</th>
                        <th className="text-right  text-xs font-medium text-gray-400 px-3 py-2">Estoque</th>
                        <th className="text-right  text-xs font-medium text-gray-400 px-3 py-2">Ficará</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previaLote.insumos?.map((it: any, i: number) => (
                        <tr key={i} className={`border-t border-gray-50 ${!it.suficiente ? 'bg-red-50/40' : ''}`}>
                          <td className="px-3 py-2 text-sm font-medium text-gray-900">
                            {it.nome}
                            {it.ehProduto && <span className="ml-2 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-1.5 py-0.5">produto</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-sm text-gray-600">−{fmtQtd(it.total)} {it.unidade}</td>
                          <td className="px-3 py-2 text-right text-sm text-gray-500">{fmtQtd(it.estoqueAtual)}</td>
                          <td className="px-3 py-2 text-right text-sm font-semibold">
                            <span className={it.suficiente ? 'text-green-600' : 'text-red-600'}>
                              {fmtQtd(Math.max(0, it.restante))}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {previaLote.temInsuficiencia && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm text-amber-700">
                      Há insumo com estoque menor que o consumo. Se confirmar, o saldo desses
                      insumos fica zerado — o negativo não é registrado.
                    </p>
                  </div>
                )}

                <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-gray-200 px-4 py-3">
                  <input type="checkbox" checked={ciente} onChange={e => setCiente(e.target.checked)}
                    className="w-4 h-4 rounded mt-0.5" />
                  <span className="text-sm text-gray-700">
                    Confirmo que estas quantidades foram <strong>realmente produzidas</strong>.
                    Ao registrar, o insumo é debitado, o estoque é somado e as células ficam bloqueadas.
                  </span>
                </label>

                <div className="flex justify-end gap-3 pt-1">
                  <Button variant="outline" onClick={fecharRegistro}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => confirmarMut.mutate()}
                    disabled={!ciente || confirmarMut.isPending || previaLote.semFicha?.length > 0}>
                    {confirmarMut.isPending ? 'Registrando...' : 'Registrar Produção'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </FormModal>
      )}
    </div>
  )
}