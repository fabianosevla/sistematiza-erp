'use client'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Plus, X, Trash2, BookOpen, ChevronRight, ChevronDown, AlertTriangle, Layers, Download, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

interface Props { tenantSlug: string }

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

// Quantidade da ficha: até 6 casas decimais (insumos usados em quantidade
// mínima, ex.: orégano a 0,00027 kg por bandeja). Mostra no mínimo 3 casas e
// corta zeros à direita além disso.
function fmtQtd(v: any) {
  const n = parseFloat(String(v ?? 0))
  if (!isFinite(n)) return '0.000'
  const s = n.toFixed(6).replace(/0+$/, '')
  const [inteiro, dec = ''] = s.split('.')
  return `${inteiro}.${dec.padEnd(3, '0')}`
}

// Unidades compatíveis entre si (podem ser convertidas pelo DebitoInsumoService)
function unidadesCompativeis(unidadeInsumo: string): string[] {
  const u = unidadeInsumo.toLowerCase()
  if (u === 'kg' || u === 'g')   return ['kg', 'g']
  if (u === 'l'  || u === 'ml')  return ['l', 'ml']
  return [unidadeInsumo] // demais unidades: só a mesma
}

type Aba = 'ficha' | 'composicao'

export default function FichaTecnicaView({ tenantSlug }: Props) {
  const { toast } = useToast()

  const [selecionado, setSelecionado]     = useState<any>(null)
  const [aba, setAba]                     = useState<Aba>('ficha')
  const [busca, setBusca]                 = useState('')
  const [novoInsumoId, setNovoInsumoId]   = useState('')
  const [novaQtd, setNovaQtd]             = useState('')
  const [novaUnidade, setNovaUnidade]     = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; nome: string } | null>(null)
  // Composição total
  const [lote, setLote]                   = useState('1')
  const [expandido, setExpandido]         = useState<number | null>(null)

  const api = (id: number) => `/api/${tenantSlug}/cadastros/produtos/${id}/ficha`

  const { data: produtosRaw } = useQuery({
    queryKey: ['produtos-ficha', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos?limit=500`)).json(),
  })

  // incluirProdutos=true: além dos insumos reais, traz produtos marcados como
  // insumo (insumoId negativo), pra poderem ser adicionados na ficha técnica.
  const { data: insumosRaw } = useQuery({
    queryKey: ['insumos-select', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/insumos?limit=500&incluirProdutos=true`)).json(),
  })

  const { data: fichaRaw, refetch } = useQuery({
    queryKey: ['ficha-tecnica', tenantSlug, selecionado?.produtoId],
    queryFn:  async () => (await fetch(api(selecionado.produtoId))).json(),
    enabled:  !!selecionado,
  })

  // Composição total (ficha explodida) — só busca quando a aba está aberta
  const multiplicador = Math.max(1, parseFloat(String(lote).replace(',', '.')) || 1)
  const { data: composicaoRaw, isLoading: loadingComp } = useQuery({
    queryKey: ['composicao', tenantSlug, selecionado?.produtoId, multiplicador],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos/${selecionado.produtoId}/composicao?multiplicador=${multiplicador}`)).json(),
    enabled:  !!selecionado && aba === 'composicao',
  })
  const composicao      = composicaoRaw?.data
  const itensComposicao: any[] = Array.isArray(composicao?.itens) ? composicao.itens : []

  const insumos: any[] = Array.isArray(insumosRaw?.data?.data) ? insumosRaw.data.data
    : Array.isArray(insumosRaw?.data) ? insumosRaw.data : []

  // Dropdown não pode conter o próprio produto como insumo (evita loop)
  const insumosDropdown = insumos.filter((i: any) => i.insumoId !== -(selecionado?.produtoId ?? 0))

  // Quando seleciona o insumo: pré-seleciona a unidade do insumo
  function onInsumoChange(id: string) {
    setNovoInsumoId(id)
    setNovaQtd('')
    if (!id) { setNovaUnidade(''); return }
    const ins = insumos.find((i: any) => i.insumoId === Number(id))
    if (ins) setNovaUnidade(ins.unidade ?? '')
  }

  // Insumo selecionado atualmente
  const insumoSelecionado = insumos.find((i: any) => i.insumoId === Number(novoInsumoId))
  const unidadesPermitidas = insumoSelecionado
    ? unidadesCompativeis(insumoSelecionado.unidade ?? '')
    : []

  const addMut = useMutation({
    mutationFn: async () => {
      // Valida compatibilidade de unidade antes de enviar
      if (insumoSelecionado) {
        const permitidas = unidadesCompativeis(insumoSelecionado.unidade ?? '')
        if (!permitidas.includes(novaUnidade.toLowerCase())) {
          throw new Error(
            `Unidade inválida. O insumo "${insumoSelecionado.nome}" usa "${insumoSelecionado.unidade}". ` +
            `Unidades aceitas: ${permitidas.join(', ')}.`
          )
        }
      }
      const res = await fetch(api(selecionado.produtoId), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          insumoId:   Number(novoInsumoId),
          quantidade: parseFloat(novaQtd),
          unidade:    novaUnidade,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? `Erro ${res.status}`)
      return data
    },
    onSuccess: () => {
      refetch()
      setNovoInsumoId('')
      setNovaQtd('')
      setNovaUnidade('')
      toast('Insumo adicionado!')
    },
    onError: (err: any) => toast(err?.message ?? 'Erro ao adicionar.', 'error'),
  })

  const removeMut = useMutation({
    mutationFn: async (itemId: number) => {
      const res = await fetch(`${api(selecionado.produtoId)}/${itemId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? `Erro ${res.status}`)
      return data
    },
    onSuccess: () => { refetch(); toast('Insumo removido.') },
    onError:   (err: any) => toast(err?.message ?? 'Erro ao remover.', 'error'),
  })

  const produtos = (
    Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data
    : Array.isArray(produtosRaw?.data)     ? produtosRaw.data
    : []
  ).filter((p: any) => p.nome?.toLowerCase().includes(busca.toLowerCase()))

  const fichaItens: any[] =
    Array.isArray(fichaRaw?.data?.itens) ? fichaRaw.data.itens
    : Array.isArray(fichaRaw?.itens)     ? fichaRaw.itens
    : Array.isArray(fichaRaw?.data)      ? fichaRaw.data
    : Array.isArray(fichaRaw)            ? fichaRaw : []

  const custoTotal = fichaItens.reduce((acc: number, item: any) => {
    const ins = insumos.find((i: any) => i.insumoId === item.insumoId)
    if (!ins?.precoCusto) return acc
    return acc + parseFloat(String(item.quantidade)) * ins.precoCusto
  }, 0)

  const precoVarejo = selecionado?.precoVarejo ?? 0
  const lucroUnit   = precoVarejo - custoTotal
  const margem      = precoVarejo > 0 ? (lucroUnit / precoVarejo) * 100 : null

  // ── Exportação da composição ───────────────────────────────────────────────
  function linhasComposicao(): string[][] {
    return itensComposicao.map((i: any) => [
      String(i.nome),
      fmtQtd(i.quantidade),
      String(i.unidade ?? ''),
      (i.custo / 100).toFixed(2),
    ])
  }

  function copiarComposicao() {
    const txt = [
      ['Insumo', 'Quantidade', 'Unidade', 'Valor (R$)'].join('\t'),
      ...linhasComposicao().map((l: string[]) => l.join('\t')),
    ].join('\n')
    navigator.clipboard.writeText(txt)
      .then(() => toast('Composição copiada — cole na planilha.'))
      .catch(() => toast('Não foi possível copiar.', 'error'))
  }

  function exportarComposicaoCSV() {
    const csv = [
      ['Insumo', 'Quantidade', 'Unidade', 'Valor (R$)'],
      ...linhasComposicao(),
    ].map((r: string[]) => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }))
    a.download = `composicao-${(selecionado?.nome ?? 'produto').replace(/\s+/g, '-').toLowerCase()}.csv`
    a.click()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Fichas Técnicas</h1>
          <p className="text-sm text-gray-400 mt-0.5">Insumos, quantidades e custo de produção por produto</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Lista de produtos */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Produtos</p>
            <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="divide-y divide-gray-50 max-h-[65vh] overflow-y-auto">
            {produtos.map((p: any) => (
              <button key={p.produtoId} onClick={() => { setSelecionado(p); setExpandido(null) }}
                className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                  selecionado?.produtoId === p.produtoId
                    ? 'bg-green-50 border-l-2 border-green-500 pl-[14px]'
                    : 'hover:bg-gray-50'
                }`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.nome}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.precoVarejo ? fmt(p.precoVarejo) : '—'}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300 flex-shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </div>

        {/* Painel da ficha */}
        <div className="lg:col-span-2">
          {!selecionado ? (
            <div className="bg-white rounded-xl border border-gray-100 flex flex-col items-center justify-center h-64 text-center px-4">
              <BookOpen size={28} className="text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">Selecione um produto</p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">Clique em qualquer produto para ver e editar sua ficha técnica</p>
            </div>
          ) : (
            <div className="space-y-3">

              {/* Header */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{selecionado.nome}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      {selecionado.tipo && <Badge variant="secondary">{selecionado.tipo}</Badge>}
                      {precoVarejo > 0 && (
                        <span className="text-sm text-gray-500">Varejo: <span className="font-semibold text-gray-900">{fmt(precoVarejo)}</span></span>
                      )}
                      {custoTotal > 0 && (
                        <span className="text-sm text-gray-500">Custo prod.: <span className="font-semibold text-orange-600">{fmt(custoTotal)}</span></span>
                      )}
                    </div>
                  </div>
                  {margem !== null && (
                    <div className={`text-center px-4 py-2 rounded-xl border ${margem >= 40 ? 'bg-green-50 border-green-200' : margem >= 20 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                      <p className="text-xs text-gray-500">Margem Bruta</p>
                      <p className={`text-2xl font-bold ${margem >= 40 ? 'text-green-600' : margem >= 20 ? 'text-amber-600' : 'text-red-600'}`}>{margem.toFixed(1)}%</p>
                      <p className="text-xs text-gray-400">lucro: {fmt(lucroUnit)}/un</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Abas */}
              <div className="border-b border-gray-100">
                <div className="flex gap-0">
                  {([
                    { key: 'ficha',      label: 'Ficha Técnica',    icon: BookOpen },
                    { key: 'composicao', label: 'Composição Total', icon: Layers },
                  ] as const).map(a => (
                    <button key={a.key} onClick={() => setAba(a.key)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                        aba === a.key ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}>
                      <a.icon size={14} />
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── ABA: FICHA TÉCNICA ─────────────────────────────────────── */}
              {aba === 'ficha' && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">

                {/* Formulário adicionar */}
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                  <p className="text-xs font-medium text-gray-500 mb-3">Adicionar insumo à ficha</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Insumo *</Label>
                      <select value={novoInsumoId} onChange={e => onInsumoChange(e.target.value)}
                        className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                        <option value="">Selecionar...</option>
                        {insumosDropdown.map((ins: any) => (
                          <option key={ins.insumoId} value={ins.insumoId}>
                            {ins.nome} ({ins.unidade}){ins.origem === 'produto' ? ' [produto-insumo]' : ''}{ins.precoCusto ? ` — ${fmt(ins.precoCusto)}/${ins.unidade}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Quantidade *</Label>
                      {/* step="any" + até 6 casas: aceita valores mínimos como 0,00027 */}
                      <Input type="number" min="0" step="any" value={novaQtd}
                        onChange={e => setNovaQtd(e.target.value)}
                        className="mt-1 h-9 text-sm" placeholder="0.000000" />
                      <p className="text-[10px] text-gray-400 mt-1">Até 6 casas decimais (ex.: 0,00027)</p>
                    </div>
                    <div>
                      <Label className="text-xs">
                        Unidade
                        {insumoSelecionado && unidadesPermitidas.length > 1 && (
                          <span className="text-gray-400 font-normal ml-1">(aceita: {unidadesPermitidas.join(', ')})</span>
                        )}
                      </Label>
                      {unidadesPermitidas.length <= 1 ? (
                        // Unidade única — não editável
                        <Input value={novaUnidade} readOnly
                          className="mt-1 h-9 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
                      ) : (
                        // kg↔g ou l↔ml — permite escolher
                        <select value={novaUnidade} onChange={e => setNovaUnidade(e.target.value)}
                          className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                          {unidadesPermitidas.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      )}
                      {insumoSelecionado && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          Estoque em <strong>{insumoSelecionado.unidade}</strong> — o sistema converte automaticamente.
                        </p>
                      )}
                    </div>
                  </div>
                  <Button size="sm" className="mt-3" onClick={() => addMut.mutate()}
                    disabled={!novoInsumoId || !novaQtd || !novaUnidade || addMut.isPending}>
                    <Plus size={13} className="mr-1" />
                    {addMut.isPending ? 'Adicionando...' : 'Adicionar'}
                  </Button>
                </div>

                {/* Itens */}
                {fichaItens.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <AlertTriangle size={20} className="text-amber-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-600">Ficha vazia</p>
                    <p className="text-xs text-gray-400 mt-1">Adicione os insumos para produzir 1 unidade deste produto</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/30">
                        <th className="text-left  text-xs font-medium text-gray-400 px-5 py-3">Insumo</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Quantidade / Un</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Preço Custo / Un</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Custo da Fração</th>
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {fichaItens.map((item: any) => {
                        const ins = insumos.find((i: any) => i.insumoId === item.insumoId)
                        const qtd = parseFloat(String(item.quantidade))
                        const precoCusto  = ins?.precoCusto ?? item.precoCusto ?? 0
                        const custoFracao = qtd * precoCusto
                        return (
                          <tr key={item.produtoInsumoId ?? item.itemId} className="group border-b border-gray-50 hover:bg-gray-50/50">
                            <td className="px-5 py-3 text-sm font-medium text-gray-900">
                              {item.nomeInsumo ?? ins?.nome ?? `#${item.insumoId}`}
                              {item.ehProduto && <span className="ml-2 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-1.5 py-0.5">produto</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-600">{fmtQtd(item.quantidade)} <span className="text-gray-400">{item.unidade}</span></td>
                            <td className="px-4 py-3 text-right text-sm text-gray-600">{precoCusto ? fmt(precoCusto) : <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold">
                              {custoFracao > 0 ? <span className="text-orange-600">{fmt(custoFracao)}</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <button
                                onClick={() => setConfirmDelete({ id: item.produtoInsumoId ?? item.itemId, nome: item.nomeInsumo ?? ins?.nome ?? `#${item.insumoId}` })}
                                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {custoTotal > 0 && (
                      <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                        <tr>
                          <td colSpan={3} className="px-5 py-3 text-sm font-bold text-gray-700 text-right">Custo total / unidade produzida</td>
                          <td className="px-4 py-3 text-right text-base font-bold text-orange-600">{fmt(custoTotal)}</td>
                          <td />
                        </tr>
                        {precoVarejo > 0 && (
                          <tr>
                            <td colSpan={3} className="px-5 pb-3 text-sm font-bold text-gray-700 text-right">Lucro bruto / unidade (varejo)</td>
                            <td className={`px-4 pb-3 text-right text-base font-bold ${lucroUnit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(lucroUnit)}</td>
                            <td />
                          </tr>
                        )}
                      </tfoot>
                    )}
                  </table>
                )}
              </div>
              )}

              {/* ── ABA: COMPOSIÇÃO TOTAL ──────────────────────────────────── */}
              {aba === 'composicao' && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">

                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      Insumos puros consolidados — produtos-insumo são abertos e as quantidades repetidas somadas
                    </p>
                    <div className="flex items-end gap-2">
                      <div>
                        <Label className="text-xs">Calcular para</Label>
                        <Input type="number" min="1" step="any" value={lote}
                          onChange={e => setLote(e.target.value)}
                          className="mt-1 h-9 text-sm w-28" />
                      </div>
                      <span className="text-sm text-gray-500 pb-2">unidade(s)</span>
                    </div>
                  </div>
                  {itensComposicao.length > 0 && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={copiarComposicao}>
                        <Copy size={13} className="mr-1.5" /> Copiar
                      </Button>
                      <Button size="sm" variant="outline" onClick={exportarComposicaoCSV}>
                        <Download size={13} className="mr-1.5" /> CSV
                      </Button>
                    </div>
                  )}
                </div>

                {composicao?.produtosExpandidos?.length > 0 && (
                  <div className="px-5 py-2.5 bg-purple-50/50 border-b border-purple-100">
                    <p className="text-xs text-purple-700">
                      Produtos-insumo abertos nesta composição: <strong>{composicao.produtosExpandidos.join(', ')}</strong>
                    </p>
                  </div>
                )}

                {loadingComp ? (
                  <p className="px-5 py-10 text-center text-sm text-gray-400">Calculando...</p>
                ) : itensComposicao.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <AlertTriangle size={20} className="text-amber-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-600">Nada a compor</p>
                    <p className="text-xs text-gray-400 mt-1">Cadastre a ficha técnica deste produto (e dos produtos-insumo usados nela).</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/30">
                        <th className="text-left  text-xs font-medium text-gray-400 px-5 py-3">Insumo</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Quantidade Total</th>
                        <th className="text-center text-xs font-medium text-gray-400 px-4 py-3">Unidade</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Valor</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {itensComposicao.map((item: any) => {
                        const aberto   = expandido === item.insumoId
                        const multiplo = (item.origens?.length ?? 0) > 1
                        return (
                          <>
                            <tr key={item.insumoId}
                              className={`border-b border-gray-50 hover:bg-gray-50/50 ${multiplo ? 'cursor-pointer' : ''}`}
                              onClick={() => multiplo && setExpandido(aberto ? null : item.insumoId)}>
                              <td className="px-5 py-3 text-sm font-medium text-gray-900">
                                <span className="inline-flex items-center gap-1.5">
                                  {multiplo && (aberto ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />)}
                                  {item.nome}
                                  {multiplo && (
                                    <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-1.5 py-0.5">
                                      {item.origens.length} origens
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800">{fmtQtd(item.quantidade)}</td>
                              <td className="px-4 py-3 text-center text-sm text-gray-500">{item.unidade}</td>
                              <td className="px-4 py-3 text-right text-sm font-semibold">
                                {item.custo > 0 ? <span className="text-orange-600">{fmt(item.custo)}</span> : <span className="text-gray-300">—</span>}
                              </td>
                              <td />
                            </tr>
                            {aberto && item.origens.map((o: any, idx: number) => (
                              <tr key={`${item.insumoId}-o${idx}`} className="bg-gray-50/60 border-b border-gray-50">
                                <td className="pl-12 pr-5 py-2 text-xs text-gray-500">via {o.origem}</td>
                                <td className="px-4 py-2 text-right text-xs text-gray-500">{fmtQtd(o.quantidade)}</td>
                                <td className="px-4 py-2 text-center text-xs text-gray-400">{item.unidade}</td>
                                <td className="px-4 py-2 text-right text-xs text-gray-400">{fmt(Math.round(o.quantidade * item.precoCusto))}</td>
                                <td />
                              </tr>
                            ))}
                          </>
                        )
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                      <tr>
                        <td colSpan={3} className="px-5 py-3 text-sm font-bold text-gray-700 text-right">
                          Custo total dos insumos {multiplicador > 1 ? `(${fmtQtd(multiplicador)} unidades)` : '(1 unidade)'}
                        </td>
                        <td className="px-4 py-3 text-right text-base font-bold text-orange-600">{fmt(composicao?.custoTotal ?? 0)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}

                {composicao?.truncou && (
                  <div className="px-5 py-2.5 bg-amber-50 border-t border-amber-200">
                    <p className="text-xs text-amber-700">
                      Atenção: há referência circular ou aninhamento muito profundo entre produtos-insumo — parte da composição pode não ter sido expandida.
                    </p>
                  </div>
                )}
              </div>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmModal title="Remover insumo da ficha"
          message={`Remover "${confirmDelete.nome}" da ficha de ${selecionado?.nome}?`}
          confirmLabel="Remover" danger
          onConfirm={() => { removeMut.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  )
}