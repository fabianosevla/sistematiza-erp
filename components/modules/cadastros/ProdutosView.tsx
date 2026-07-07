'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, Download, Upload, BookOpen, Package, ArrowUpDown, EyeOff, Pencil } from 'lucide-react'
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
  const [precoVarejo, setPrecoVarejo] = useState('')
  const [atacados, setAtacados]       = useState({ A: '', B: '', C: '', D: '', E: '' })
  const [estoqueMin, setEstoqueMin]   = useState('0')
  const [estoqueAtual, setEstoqueAtual] = useState('0')
  const [ativo, setAtivo]             = useState(true)
  const [revenda, setRevenda]         = useState(false)
  const [fichaInsumoId, setFichaInsumoId] = useState('')
  const [fichaQtd, setFichaQtd]           = useState('')
  const [fichaUnidade, setFichaUnidade]   = useState('')

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

  const { data: insumosRaw } = useQuery({
    queryKey: ['insumos-select', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/insumos?limit=500`)).json(),
  })

  // ── FICHA TÉCNICA query ────────────────────────────────────────────────────
  // CORREÇÃO: a rota GET retorna { data: { itens: [...], custoProdução: ... } }
  // então precisamos de fichaRaw?.data?.itens, não fichaRaw?.data diretamente.
  const { data: fichaRaw, refetch: refetchFicha } = useQuery({
    queryKey: ['ficha', tenantSlug, showFicha?.produtoId],
    queryFn:  async () => (await fetch(`${api}/${showFicha.produtoId}/ficha`)).json(),
    enabled:  !!showFicha,
  })

  // ── MUTATIONS ─────────────────────────────────────────────────────────────

  const salvarMut = useMutation({
    mutationFn: async () => {
      const parseP = (v: string) => v ? Math.round(parseFloat(v.replace(',', '.')) * 100) : 0
      const payload = {
        nome, tipo: revenda ? 'Revenda' : tipo, unidade, activeFlag: ativo, revenda,
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

  const addFichaMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${api}/${showFicha.produtoId}/ficha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insumoId:   Number(fichaInsumoId),
          quantidade: parseFloat(fichaQtd),
          unidade:    fichaUnidade,
        }),
      })
      const data = await res.json()
      // CORREÇÃO: checar res.ok para não mostrar "Insumo adicionado!" em erro
      if (!res.ok) {
        const msg = data?.message ?? data?.error ?? `Erro ${res.status} ao adicionar insumo`
        throw new Error(msg)
      }
      return data
    },
    onSuccess: () => {
      refetchFicha()
      setFichaInsumoId('')
      setFichaQtd('')
      toast('Insumo adicionado!')
    },
    onError: (err: any) => toast(err?.message ?? 'Erro ao adicionar insumo.', 'error'),
  })

  const removeFichaMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${showFicha.produtoId}/ficha/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao remover')
      return data
    },
    onSuccess: () => refetchFicha(),
    onError:   (err: any) => toast(err?.message ?? 'Erro ao remover insumo.', 'error'),
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
    } else {
      setEditando(null)
      setNome('')
      setTipo(tipos[0] ?? '')
      setUnidade(unidades[0] ?? '')
      setPrecoVarejo('')
      setAtacados({ A: '', B: '', C: '', D: '', E: '' })
      setEstoqueMin('0')
      setEstoqueAtual('0')
      setAtivo(true)
      setRevenda(false)
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

  const insumos = Array.isArray(insumosRaw?.data?.data) ? insumosRaw.data.data
    : Array.isArray(insumosRaw?.data) ? insumosRaw.data : []

  // CORREÇÃO: rota GET /ficha retorna { data: { itens: [...], custoProdução: ... } }
  // fichaRaw.data é { itens, custoProdução }, não um array diretamente.
  const fichaItens = Array.isArray(fichaRaw?.data?.itens) ? fichaRaw.data.itens
    : Array.isArray(fichaRaw?.itens) ? fichaRaw.itens
    : Array.isArray(fichaRaw?.data) ? fichaRaw.data
    : Array.isArray(fichaRaw) ? fichaRaw : []

  const produtos = [...todos]
    .filter((p: any) => p.nome?.toLowerCase().includes(busca.toLowerCase()))
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
                      {!inativo && (<><button onClick={() => abrirModal(p)} title="Editar" className="p-1 text-green-400 hover:text-green-600"><Pencil size={14} /></button><button onClick={() => setShowFicha(p)} title="Ficha técnica" className="p-1 text-blue-400 hover:text-blue-600"><BookOpen size={14} /></button></>)}
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

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Preços</p>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div>
                    <Label className="text-xs text-green-700 font-semibold">Varejo (R$)</Label>
                    <Input type="number" min="0" step="0.01" value={precoVarejo}
                      onChange={e => setPrecoVarejo(e.target.value)} className="mt-1 h-9" placeholder="0,00" />
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
                  Produtos de revenda aparecem na seleção de Compra Rápida.
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

      {/* Modal Ficha Técnica */}
      {showFicha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold">Ficha Técnica</h2>
                <p className="text-sm text-gray-400 mt-0.5">{showFicha.nome} — insumos por unidade produzida</p>
              </div>
              <button onClick={() => setShowFicha(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6">
              {/* Formulário para adicionar insumo */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Adicionar Insumo</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Insumo *</Label>
                    <select
                      value={fichaInsumoId}
                      onChange={e => {
                        setFichaInsumoId(e.target.value)
                        const ins = insumos.find((i: any) => i.insumoId === Number(e.target.value))
                        if (ins) setFichaUnidade(ins.unidade ?? 'kg')
                      }}
                      className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                      <option value="">Selecionar...</option>
                      {insumos.map((ins: any) => (
                        <option key={ins.insumoId} value={ins.insumoId}>{ins.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Quantidade *</Label>
                    <Input type="number" min="0" step="0.001" value={fichaQtd}
                      onChange={e => setFichaQtd(e.target.value)} className="mt-1 h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Unidade</Label>
                    <select value={fichaUnidade} onChange={e => setFichaUnidade(e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                      {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <Button size="sm" className="mt-3"
                  onClick={() => addFichaMut.mutate()}
                  disabled={!fichaInsumoId || !fichaQtd || addFichaMut.isPending}>
                  <Plus size={13} className="mr-1" />
                  {addFichaMut.isPending ? 'Adicionando...' : 'Adicionar'}
                </Button>
              </div>

              {/* Lista de insumos da ficha */}
              {fichaItens.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  Nenhum insumo na ficha técnica.
                </p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Insumo','Qtd / unidade','Unidade',''].map((h, i) => (
                        <th key={i}
                          className={`text-${i === 0 ? 'left' : 'center'} text-xs font-medium text-gray-400 px-3 py-2`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fichaItens.map((item: any) => (
                      <tr key={item.produtoInsumoId ?? item.itemId} className="border-b border-gray-50 group">
                        <td className="px-3 py-2.5 text-sm font-medium text-gray-900">
                          {item.nomeInsumo ?? item.insumo?.nome ?? `#${item.insumoId}`}
                        </td>
                        <td className="px-3 py-2.5 text-center text-sm text-gray-600">
                          {parseFloat(String(item.quantidade)).toFixed(3)}
                        </td>
                        <td className="px-3 py-2.5 text-center text-sm text-gray-500">{item.unidade}</td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => removeFichaMut.mutate(item.produtoInsumoId ?? item.itemId)}
                            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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
