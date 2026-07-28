'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, Download, Upload, BookOpen, Package, ArrowUpDown, EyeOff, Pencil, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import ImportacaoModal from '@/components/modules/importacao/ImportacaoModal'
import Paginacao from '@/components/ui/Paginacao'
import { useDominio } from '@/hooks/useDominio'
import { AuditoriaInfo } from '@/components/ui/AuditoriaInfo'

interface Props { tenantSlug: string }

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtInput(c: number) { return c > 0 ? (c / 100).toFixed(2) : '' }
function fmtQtd(v: any) {
  const n = parseFloat(String(v ?? 0))
  if (!isFinite(n)) return '0.000'
  const s = n.toFixed(6).replace(/0+$/, '')
  const [inteiro, dec = ''] = s.split('.')
  return `${inteiro}.${dec.padEnd(3, '0')}`
}

type SortKey = 'nome' | 'tipo' | 'precoVarejo' | 'estoqueAtual'
type SortDir  = 'asc' | 'desc'

export default function ProdutosView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/cadastros/produtos`

  const tipos    = useDominio(tenantSlug, 'tipo_produto',   ['Massa','Molho','Acompanhamento','Bebida','Outro'])
  const unidades = useDominio(tenantSlug, 'unidade_medida', ['kg','g','l','ml','un','cx'])

  const [busca, setBusca]                 = useState('')
  const [page, setPage]               = useState(1)
  const [limit, setLimit]             = useState(20)
  const [showInativos, setShowInativos]   = useState(false)
  const [showModal, setShowModal]         = useState(false)
  const [showImport, setShowImport]       = useState(false)
  const [showFicha, setShowFicha]         = useState<any>(null)
  const [editando, setEditando]           = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; nome: string } | null>(null)
  const [sortKey, setSortKey]             = useState<SortKey>('nome')
  const [sortDir, setSortDir]             = useState<SortDir>('asc')

  const [nome, setNome]               = useState('')
  const [tipo, setTipo]               = useState('')
  const [unidade, setUnidade]         = useState('')
  // CORREÇÃO (dados ocultos): descricao, codigoBarras, categoria e precoCusto
  // existiam no banco mas não apareciam em lugar nenhum da tela.
  const [descricao, setDescricao]       = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [categoria, setCategoria]       = useState('')
  const [precoCusto, setPrecoCusto]     = useState('')
  const [precoVarejo, setPrecoVarejo] = useState('')
  const [atacados, setAtacados]       = useState({ A: '', B: '', C: '', D: '', E: '' })
  const [estoqueMin, setEstoqueMin]   = useState('0')
  const [estoqueAtual, setEstoqueAtual] = useState('0')
  const [ativo, setAtivo]             = useState(true)
  const [revenda, setRevenda]         = useState(false)
  const [insumoAtivo, setInsumoAtivo] = useState(false)

  useEffect(() => { setPage(1) }, [busca])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['produtos', tenantSlug] })

  const { data: raw, isLoading } = useQuery({
    queryKey: ['produtos', tenantSlug, page, limit, busca, showInativos],
    queryFn:  async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (busca) params.set('search', busca)
      if (showInativos) params.set('incluirInativos', 'true')
      return (await fetch(`${api}?${params}`)).json()
    },
  })

  // ── FICHA TÉCNICA query (somente leitura) ─────────────────────────────────
  // A rota GET retorna { data: { itens: [...], custoProdução: ... } }
  // então precisamos de fichaRaw?.data?.itens, não fichaRaw?.data diretamente.
  const { data: fichaRaw } = useQuery({
    queryKey: ['ficha', tenantSlug, showFicha?.produtoId],
    queryFn:  async () => (await fetch(`${api}/${showFicha.produtoId}/ficha`)).json(),
    enabled:  !!showFicha,
  })

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

  const salvarMut = useMutation({
    mutationFn: async () => {
      const parseP = (v: string) => v ? Math.round(parseFloat(v.replace(',', '.')) * 100) : 0
      const payload = {
        // CORREÇÃO: revenda agora é flag PRÓPRIA (coluna revenda no banco) —
        // não sobrescreve mais o tipo. Um produto pode ser "Bebida" E revenda.
        nome, tipo, unidade, activeFlag: ativo, revenda,
        descricao:     descricao.trim() || null,
        codigoBarras:  codigoBarras.trim() || null,
        categoria:     categoria.trim() || null,
        insumoFlg:     insumoAtivo,
        precoCusto:    parseP(precoCusto),
        precoVarejo:   parseP(precoVarejo),
        precoAtacado:  parseP(atacados.A),
        precoAtacadoA: parseP(atacados.A),
        precoAtacadoB: parseP(atacados.B),
        precoAtacadoC: parseP(atacados.C),
        precoAtacadoD: parseP(atacados.D),
        precoAtacadoE: parseP(atacados.E),
        estoqueMinimo: Number(estoqueMin),
        // inclui modificationNum para suportar o optimistic locking da rota PUT
        ...(editando?.modificationNum !== undefined
          ? { modificationNum: editando.modificationNum }
          : {}),
      }
      const url    = editando ? `${api}/${editando.produtoId}` : api
      const method = editando ? 'PUT' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      // CORREÇÃO CRÍTICA: checar res.ok para não disparar onSuccess em erros
      // Sem isso, uma resposta 409/500 do servidor disparava onSuccess, fechava
      // o modal e mostrava "Produto atualizado!" mas nada tinha sido salvo.
      if (!res.ok) {
        const msg = data?.message ?? data?.error ?? `Erro ${res.status} ao salvar produto`
        throw new Error(msg)
      }
      return data
    },
    onSuccess: () => {
      invalidate()
      fecharModal()
      toast(editando ? 'Produto atualizado!' : 'Produto criado!')
    },
    onError: (err: any) => toast(err?.message ?? 'Erro ao salvar.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao excluir')
      return data
    },
    onSuccess: () => { invalidate(); toast('Produto desativado. Histórico de vendas preservado.') },
    onError:   (err: any) => toast(err?.message ?? 'Erro ao excluir.', 'error'),
  })

  const reativarMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeFlag: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao reativar')
      return data
    },
    onSuccess: () => { invalidate(); toast('Produto reativado!') },
    onError:   (err: any) => toast(err?.message ?? 'Erro ao reativar.', 'error'),
  })

  // ── HELPERS ───────────────────────────────────────────────────────────────

  function abrirModal(item?: any) {
    if (item) {
      setEditando(item)
      setNome(item.nome)
      setTipo(item.tipo ?? tipos[0] ?? '')
      setUnidade(item.unidade ?? unidades[0] ?? '')
      setDescricao(item.descricao ?? '')
      setCodigoBarras(item.codigoBarras ?? '')
      setCategoria(item.categoria ?? '')
      setPrecoCusto(item.precoCusto ? fmtInput(item.precoCusto) : '')
      setPrecoVarejo(fmtInput(item.precoVarejo))
      setAtacados({
        A: fmtInput(item.precoAtacadoA ?? item.precoAtacado ?? 0),
        B: fmtInput(item.precoAtacadoB ?? 0),
        C: fmtInput(item.precoAtacadoC ?? 0),
        D: fmtInput(item.precoAtacadoD ?? 0),
        E: fmtInput(item.precoAtacadoE ?? 0),
      })
      setEstoqueMin(String(item.estoqueMinimo ?? 0))
      setEstoqueAtual(String(item.estoqueAtual ?? 0))
      setAtivo(item.activeFlag ?? true)
      setRevenda(item.tipo === 'Revenda' || item.revenda === true)
      setInsumoAtivo(item.insumoFlg === true)
    } else {
      setEditando(null)
      setNome('')
      setTipo(tipos[0] ?? '')
      setUnidade(unidades[0] ?? '')
      setDescricao('')
      setCodigoBarras('')
      setCategoria('')
      setPrecoCusto('')
      setPrecoVarejo('')
      setAtacados({ A: '', B: '', C: '', D: '', E: '' })
      setEstoqueMin('0')
      setEstoqueAtual('0')
      setAtivo(true)
      setRevenda(false)
      setInsumoAtivo(false)
    }
    setShowModal(true)
  }

  function fecharModal() { setShowModal(false); setEditando(null) }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <ArrowUpDown size={11} className="ml-1 text-gray-300 inline" />
    return <span className="ml-1 text-green-500 text-[11px] inline">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function exportCSV() {
    const rows = todos.map((p: any) => [
      p.produtoId, p.nome, p.tipo ?? '', p.unidade ?? '',
      p.precoVarejo ? (p.precoVarejo / 100).toFixed(2) : '0',
      p.estoqueAtual, p.estoqueMinimo,
      p.activeFlag ? 'Ativo' : 'Inativo',
    ])
    const csv = [['ID','Nome','Tipo','Unidade','Preço Varejo','Est.Atual','Est.Mín','Status'], ...rows]
      .map(r => r.map((c: any) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }))
    a.download = 'produtos.csv'
    a.click()
  }

  // ── DADOS DERIVADOS ───────────────────────────────────────────────────────

  const todos   = Array.isArray(raw?.data?.data) ? raw.data.data
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw) ? raw : []

  // CORREÇÃO: rota GET /ficha retorna { data: { itens: [...], custoProdução: ... } }
  const fichaItens = Array.isArray(fichaRaw?.data?.itens) ? fichaRaw.data.itens
    : Array.isArray(fichaRaw?.itens) ? fichaRaw.itens
    : Array.isArray(fichaRaw?.data) ? fichaRaw.data
    : Array.isArray(fichaRaw) ? fichaRaw : []

  // Custo de produção calculado pela própria rota; fallback soma local
  const custoFicha = Number(
    fichaRaw?.data?.['custoProdução'] ??
    fichaItens.reduce((acc: number, i: any) => acc + parseFloat(String(i.quantidade ?? 0)) * Number(i.precoCusto ?? 0), 0)
  )

  const produtos = [...todos]
    .sort((a: any, b: any) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'pt-BR')
      return sortDir === 'asc' ? cmp : -cmp
    })

  const inativos = todos.filter((p: any) => !p.activeFlag).length

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Produtos</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {todos.filter((p: any) => p.activeFlag !== false).length} ativos
            {inativos > 0 && <span className="ml-2 text-gray-300">· {inativos} inativos</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowInativos(v => !v)}
            className={showInativos ? 'border-amber-300 text-amber-600' : ''}>
            <EyeOff size={14} className="mr-1.5" />
            {showInativos ? 'Ocultar inativos' : 'Ver inativos'}
          </Button>
          <Button variant="outline" onClick={exportCSV}><Download size={14} className="mr-1.5" /> CSV</Button>
          <Button variant="outline" onClick={() => setShowImport(true)}><Upload size={14} className="mr-1.5" /> Importar</Button>
          <Button onClick={() => abrirModal()}><Plus size={15} className="mr-1.5" /> Novo Produto</Button>
        </div>
      </div>

      {/* Filtro */}
      <div className="flex gap-3 mb-4">
        <Input
          placeholder="Buscar produto..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="max-w-xs h-9 text-sm"
        />
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 cursor-pointer select-none hover:text-gray-600"
                onClick={() => toggleSort('nome')}>Nome <SortIcon col="nome" /></th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3 cursor-pointer select-none hover:text-gray-600"
                onClick={() => toggleSort('tipo')}>Tipo <SortIcon col="tipo" /></th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3">Unidade</th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3 cursor-pointer select-none hover:text-gray-600"
                onClick={() => toggleSort('precoVarejo')}>Varejo <SortIcon col="precoVarejo" /></th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3">Atacado A</th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3 cursor-pointer select-none hover:text-gray-600"
                onClick={() => toggleSort('estoqueAtual')}>Estoque <SortIcon col="estoqueAtual" /></th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3">Status</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableSkeleton rows={6} cols={8} />
            ) : produtos.length === 0 ? (
              <tr><td colSpan={8}>
                <EmptyState icon={Package} title="Nenhum produto cadastrado"
                  action="Cadastrar primeiro produto" onAction={() => abrirModal()} />
              </td></tr>
            ) : produtos.map((p: any) => {
              const inativo = p.activeFlag === false
              return (
                <tr key={p.produtoId}
                  className={`group border-b border-gray-50 transition-colors ${inativo ? 'opacity-50 bg-gray-50/50' : 'hover:bg-gray-50/80'}`}>
                  <td className="pl-[10px] pr-4 py-3 border-l-2 border-transparent group-hover:border-green-500 transition-all duration-150">
                    <span
                      className={`text-sm font-medium ${inativo ? 'text-gray-400 line-through' : 'text-gray-900 cursor-pointer hover:text-green-700'}`}
                      onClick={() => !inativo && abrirModal(p)}>
                      {p.nome}
                    </span>
                    {p.insumoFlg && !inativo && (
                      <span className="ml-2 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-1.5 py-0.5 align-middle">insumo</span>
                    )}
                    {p.revenda && !inativo && (
                      <span className="ml-2 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-1.5 py-0.5 align-middle">revenda</span>
                    )}
                    {inativo && (
                      <p className="text-xs text-gray-400 mt-0.5">desativado — preservado no histórico</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center"><Badge variant="secondary">{p.tipo ?? '—'}</Badge></td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500">{p.unidade ?? '—'}</td>
                  <td className="px-4 py-3 text-center text-sm font-medium">{p.precoVarejo ? fmt(p.precoVarejo) : '—'}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500">
                    {(p.precoAtacadoA ?? p.precoAtacado) ? fmt(p.precoAtacadoA ?? p.precoAtacado) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-semibold ${p.estoqueAtual <= p.estoqueMinimo ? 'text-red-600' : 'text-green-600'}`}>
                      {p.estoqueAtual}
                    </span>
                    <span className="text-xs text-gray-300">/{p.estoqueMinimo}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={inativo ? 'secondary' : 'default'}>{inativo ? 'Inativo' : 'Ativo'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!inativo && (<><button onClick={() => abrirModal(p)} title="Editar" className="p-1 text-green-400 hover:text-green-600"><Pencil size={14} /></button><button onClick={() => setShowFicha(p)} title="Ver ficha técnica (somente leitura)" className="p-1 text-blue-400 hover:text-blue-600"><BookOpen size={14} /></button></>)}
                      {inativo ? (
                        <button onClick={() => reativarMut.mutate(p.produtoId)} title="Reativar"
                          className="p-1 text-green-400 hover:text-green-600 text-xs font-medium">↺</button>
                      ) : (
                        <button onClick={() => setConfirmDelete({ id: p.produtoId, nome: p.nome })}
                          className="p-1 text-gray-300 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Paginacao
        page={page}
        totalPages={raw?.data?.meta?.totalPages ?? 1}
        total={raw?.data?.meta?.total ?? produtos.length}
        limit={limit}
        onPage={setPage}
        onLimit={(l) => { setLimit(l); setPage(1) }}
      />

      {/* Modal Criar/Editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">{editando ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <select value={tipo} onChange={e => setTipo(e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Unidade</Label>
                  <select value={unidade} onChange={e => setUnidade(e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Categoria</Label>
                  <Input value={categoria} onChange={e => setCategoria(e.target.value)} className="mt-1" placeholder="Ex.: Massas, Bebidas…" />
                </div>
                <div>
                  <Label>Código de Barras</Label>
                  <Input value={codigoBarras} onChange={e => setCodigoBarras(e.target.value)} className="mt-1" placeholder="EAN" />
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={descricao} onChange={e => setDescricao(e.target.value)} className="mt-1" placeholder="Descrição do produto (opcional)" />
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Preços</p>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-orange-700 font-semibold">Custo (R$)</Label>
                      <Input type="number" min="0" step="0.01" value={precoCusto}
                        onChange={e => setPrecoCusto(e.target.value)} className="mt-1 h-9" placeholder="0,00" />
                      <p className="text-[11px] text-gray-400 mt-1">Se o produto tem ficha técnica, o custo calculado dela prevalece — este campo é usado só como fallback.</p>
                    </div>
                    <div>
                      <Label className="text-xs text-green-700 font-semibold">Varejo (R$)</Label>
                      <Input type="number" min="0" step="0.01" value={precoVarejo}
                        onChange={e => setPrecoVarejo(e.target.value)} className="mt-1 h-9" placeholder="0,00" />
                    </div>
                  </div>
                  <div className="border-t border-gray-200 pt-3">
                    <p className="text-xs text-gray-500 font-medium mb-2">Atacado — deixe em branco os que não usar</p>
                    <div className="grid grid-cols-5 gap-2">
                      {(['A','B','C','D','E'] as const).map(k => (
                        <div key={k}>
                          <Label className="text-xs">Atac. {k}</Label>
                          <Input type="number" min="0" step="0.01" value={atacados[k]}
                            onChange={e => setAtacados(prev => ({ ...prev, [k]: e.target.value }))}
                            className="mt-1 h-9 text-sm" placeholder="0,00" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Estoque Atual</Label>
                  <Input
                    type="number"
                    value={estoqueAtual}
                    readOnly
                    className="mt-1 bg-gray-50 text-gray-400 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-400 mt-1">Altere via módulo Estoque → Produto Acabado</p>
                </div>
                <div>
                  <Label>Estoque Mínimo</Label>
                  <Input type="number" min="0" value={estoqueMin}
                    onChange={e => setEstoqueMin(e.target.value)} className="mt-1" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="w-4 h-4 rounded" />
                  <span className="text-sm text-gray-700">Produto ativo</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={revenda} onChange={e => setRevenda(e.target.checked)} className="w-4 h-4 rounded" />
                  <span className="text-sm text-gray-700">Produto para revenda</span>
                </label>
              </div>
              {revenda && (
                <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
                  Produtos de revenda aparecem na Compra Rápida e NÃO aparecem na grade de Produção (são comprados prontos). O tipo (ex.: Bebida) é mantido.
                </p>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={insumoAtivo} onChange={e => setInsumoAtivo(e.target.checked)} className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-700">Usar também como insumo em outros produtos</span>
              </label>
              {insumoAtivo && (
                <p className="text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-2">
                  Este produto passa a aparecer na tela de Insumos e nos dropdowns de Ficha Técnica. Ao produzir um produto que o usa como insumo, o estoque dele é baixado — os insumos que o compõem só baixam quando você produz este produto.
                </p>
              )}

              {editando && (
                <AuditoriaInfo
                  criadoPor={editando.createdBy}
                  criadoEm={editando.createdDt}
                  atualizadoPor={editando.updatedBy}
                  atualizadoEm={editando.updatedDt}
                  className="pt-3 border-t border-gray-100"
                />
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
                <Button onClick={() => salvarMut.mutate()} disabled={!nome || salvarMut.isPending}>
                  {salvarMut.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ficha Técnica — SOMENTE LEITURA.
          A edição (adicionar/remover insumos) fica exclusivamente em
          Cadastros → Fichas Técnicas. */}
      {showFicha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  Ficha Técnica
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">
                    <Lock size={9} /> somente leitura
                  </span>
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">{showFicha.nome} — insumos por unidade produzida</p>
              </div>
              <button onClick={() => setShowFicha(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">
                <p className="text-xs text-blue-700">
                  Para adicionar, alterar ou remover insumos desta ficha, acesse <strong>Cadastros → Fichas Técnicas</strong>.
                </p>
              </div>

              {fichaItens.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  Nenhum insumo na ficha técnica.
                </p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left  text-xs font-medium text-gray-400 px-3 py-2">Insumo</th>
                      <th className="text-right text-xs font-medium text-gray-400 px-3 py-2">Qtd / unidade</th>
                      <th className="text-center text-xs font-medium text-gray-400 px-3 py-2">Unidade</th>
                      <th className="text-right text-xs font-medium text-gray-400 px-3 py-2">Preço Custo</th>
                      <th className="text-right text-xs font-medium text-gray-400 px-3 py-2">Custo da Fração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fichaItens.map((item: any) => {
                      const qtd         = parseFloat(String(item.quantidade ?? 0))
                      const precoCustoI = Number(item.precoCusto ?? 0)
                      const custoFracao = qtd * precoCustoI
                      return (
                        <tr key={item.produtoInsumoId ?? item.itemId} className="border-b border-gray-50">
                          <td className="px-3 py-2.5 text-sm font-medium text-gray-900">
                            {item.nomeInsumo ?? item.insumo?.nome ?? `#${item.insumoId}`}
                            {item.ehProduto && <span className="ml-2 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-1.5 py-0.5">produto</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right text-sm text-gray-600">{fmtQtd(item.quantidade)}</td>
                          <td className="px-3 py-2.5 text-center text-sm text-gray-500">{item.unidade}</td>
                          <td className="px-3 py-2.5 text-right text-sm text-gray-600">
                            {precoCustoI ? fmt(precoCustoI) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right text-sm font-semibold">
                            {custoFracao > 0 ? <span className="text-orange-600">{fmt(custoFracao)}</span> : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {custoFicha > 0 && (
                    <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                      <tr>
                        <td colSpan={4} className="px-3 py-3 text-sm font-bold text-gray-700 text-right">Custo total / unidade produzida</td>
                        <td className="px-3 py-3 text-right text-base font-bold text-orange-600">{fmt(custoFicha)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              <div className="flex justify-end pt-6">
                <Button variant="outline" onClick={() => setShowFicha(null)}>Fechar</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV */}
      {showImport && (
        <ImportacaoModal
          tenantSlug={tenantSlug}
          entidade="produtos"
          queryKey="produtos"
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Confirm desativar */}
      {confirmDelete && (
        <ConfirmModal
          title="Desativar produto"
          message={`Desativar "${confirmDelete.nome}"? O produto some dos formulários mas o histórico de vendas é preservado. Você pode reativar a qualquer momento.`}
          confirmLabel="Desativar"
          danger
          onConfirm={() => { excluirMut.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}


    </div>
  )
}