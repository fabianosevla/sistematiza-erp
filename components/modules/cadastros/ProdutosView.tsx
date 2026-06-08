'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, Download, Upload, BookOpen, Package, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import CsvImportModal from '@/components/ui/CsvImportModal'
import { useDominio } from '@/hooks/useDominio'

interface Props { tenantSlug: string }

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

type SortKey = 'nome' | 'tipo' | 'precoVarejo' | 'estoqueAtual'
type SortDir = 'asc' | 'desc'

export default function ProdutosView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/cadastros/produtos`

  // Domínios configuráveis — fallback garante funcionamento se API demorar
  const tipos    = useDominio(tenantSlug, 'tipo_produto',   ['Massa', 'Molho', 'Acompanhamento', 'Bebida', 'Outro'])
  const unidades = useDominio(tenantSlug, 'unidade_medida', ['kg', 'g', 'l', 'ml', 'un', 'cx'])

  const [busca, setBusca]             = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [showImport, setShowImport]   = useState(false)
  const [showFicha, setShowFicha]     = useState<any>(null)
  const [editando, setEditando]       = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; nome: string } | null>(null)
  const [sortKey, setSortKey]         = useState<SortKey>('nome')
  const [sortDir, setSortDir]         = useState<SortDir>('asc')

  const [nome, setNome]                 = useState('')
  const [tipo, setTipo]                 = useState('')
  const [unidade, setUnidade]           = useState('')
  const [precoVarejo, setPrecoVarejo]   = useState('')
  const [precoAtacado, setPrecoAtacado] = useState('')
  const [estoqueMin, setEstoqueMin]     = useState('0')
  const [estoqueAtual, setEstoqueAtual] = useState('0')
  const [ativo, setAtivo]               = useState(true)
  const [fichaInsumoId, setFichaInsumoId]     = useState('')
  const [fichaQuantidade, setFichaQuantidade] = useState('')
  const [fichaUnidade, setFichaUnidade]       = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['produtos', tenantSlug] })

  const { data: raw, isLoading } = useQuery({
    queryKey: ['produtos', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
  })

  const { data: insumosRaw } = useQuery({
    queryKey: ['insumos-select', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/insumos`)).json(),
  })

  const { data: fichaRaw, refetch: refetchFicha } = useQuery({
    queryKey: ['ficha', tenantSlug, showFicha?.produtoId],
    queryFn:  async () => (await fetch(`${api}/${showFicha.produtoId}/ficha`)).json(),
    enabled:  !!showFicha,
  })

  const salvarMut = useMutation({
    mutationFn: async () => {
      const payload = {
        nome, tipo, unidade,
        precoVarejo:  precoVarejo  ? Math.round(parseFloat(precoVarejo.replace(',', '.'))  * 100) : 0,
        precoAtacado: precoAtacado ? Math.round(parseFloat(precoAtacado.replace(',', '.')) * 100) : 0,
        estoqueMinimo: Number(estoqueMin), estoqueAtual: Number(estoqueAtual), activeFlag: ativo,
      }
      const url    = editando ? `${api}/${editando.produtoId}` : api
      const method = editando ? 'PUT' : 'POST'
      return fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json())
    },
    onSuccess: () => { invalidate(); fecharModal(); toast(editando ? 'Produto atualizado!' : 'Produto criado!') },
    onError:   () => toast('Erro ao salvar produto.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { invalidate(); toast('Produto excluído.') },
    onError:   () => toast('Erro ao excluir.', 'error'),
  })

  const addFichaMut = useMutation({
    mutationFn: () => fetch(`${api}/${showFicha.produtoId}/ficha`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insumoId: Number(fichaInsumoId), quantidade: parseFloat(fichaQuantidade), unidade: fichaUnidade }),
    }).then(r => r.json()),
    onSuccess: () => { refetchFicha(); setFichaInsumoId(''); setFichaQuantidade(''); toast('Insumo adicionado à ficha.') },
  })

  const removeFichaMut = useMutation({
    mutationFn: (itemId: number) => fetch(`${api}/${showFicha.produtoId}/ficha/${itemId}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess:  () => refetchFicha(),
  })

  function abrirModal(item?: any) {
    if (item) {
      setEditando(item); setNome(item.nome); setTipo(item.tipo ?? tipos[0] ?? ''); setUnidade(item.unidade ?? unidades[0] ?? '')
      setPrecoVarejo(item.precoVarejo ? (item.precoVarejo / 100).toFixed(2) : '')
      setPrecoAtacado(item.precoAtacado ? (item.precoAtacado / 100).toFixed(2) : '')
      setEstoqueMin(String(item.estoqueMinimo ?? 0)); setEstoqueAtual(String(item.estoqueAtual ?? 0)); setAtivo(item.activeFlag ?? true)
    } else {
      setEditando(null); setNome(''); setTipo(tipos[0] ?? ''); setUnidade(unidades[0] ?? '')
      setPrecoVarejo(''); setPrecoAtacado(''); setEstoqueMin('0'); setEstoqueAtual('0'); setAtivo(true)
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
    const rows = todosProdutos.map((p: any) => [p.produtoId, p.nome, p.tipo ?? '', p.unidade ?? '', p.precoVarejo ? (p.precoVarejo / 100).toFixed(2) : '0', p.estoqueAtual, p.estoqueMinimo])
    const csv  = [['ID', 'Nome', 'Tipo', 'Unidade', 'Preço Varejo', 'Estoque Atual', 'Estoque Mínimo'], ...rows].map(r => r.map((c: any) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' })); a.download = 'produtos.csv'; a.click()
  }

  const todosProdutos = Array.isArray(raw?.data?.data) ? raw.data.data : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : []
  const insumos       = Array.isArray(insumosRaw?.data?.data) ? insumosRaw.data.data : Array.isArray(insumosRaw?.data) ? insumosRaw.data : []
  const fichaItens    = Array.isArray(fichaRaw?.data) ? fichaRaw.data : Array.isArray(fichaRaw) ? fichaRaw : []

  const produtos = [...todosProdutos]
    .filter((p: any) => p.nome?.toLowerCase().includes(busca.toLowerCase()))
    .sort((a: any, b: any) => {
      const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'pt-BR')
      return sortDir === 'asc' ? cmp : -cmp
    })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Produtos</h1>
          <p className="text-sm text-gray-400 mt-0.5">{todosProdutos.length} cadastrados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download size={14} className="mr-1.5" /> CSV</Button>
          <Button variant="outline" onClick={() => setShowImport(true)}><Upload size={14} className="mr-1.5" /> Importar</Button>
          <Button onClick={() => abrirModal()}><Plus size={15} className="mr-1.5" /> Novo Produto</Button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <Input placeholder="Buscar produto..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-xs h-9 text-sm" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 cursor-pointer select-none hover:text-gray-600" onClick={() => toggleSort('nome')}>
                Nome <SortIcon col="nome" />
              </th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3 cursor-pointer select-none hover:text-gray-600" onClick={() => toggleSort('tipo')}>
                Tipo <SortIcon col="tipo" />
              </th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3">Unidade</th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3 cursor-pointer select-none hover:text-gray-600" onClick={() => toggleSort('precoVarejo')}>
                Preço Varejo <SortIcon col="precoVarejo" />
              </th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3 cursor-pointer select-none hover:text-gray-600" onClick={() => toggleSort('estoqueAtual')}>
                Estoque <SortIcon col="estoqueAtual" />
              </th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3">Status</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableSkeleton rows={6} cols={7} />
            ) : produtos.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState icon={Package} title="Nenhum produto cadastrado"
                    description="Cadastre seus produtos para começar a registrar vendas e controlar o estoque."
                    action="Cadastrar primeiro produto" onAction={() => abrirModal()} />
                </td>
              </tr>
            ) : produtos.map((p: any) => (
              <tr key={p.produtoId} className="group border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                <td className="pl-[10px] pr-4 py-3 border-l-2 border-transparent group-hover:border-green-500 transition-all duration-150">
                  <span className="text-sm font-medium text-gray-900 cursor-pointer hover:text-green-700" onClick={() => abrirModal(p)}>
                    {p.nome}
                  </span>
                </td>
                <td className="px-4 py-3 text-center"><Badge variant="secondary">{p.tipo ?? '—'}</Badge></td>
                <td className="px-4 py-3 text-center text-sm text-gray-500">{p.unidade ?? '—'}</td>
                <td className="px-4 py-3 text-center text-sm font-medium">{p.precoVarejo ? fmt(p.precoVarejo) : '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-sm font-semibold ${p.estoqueAtual <= p.estoqueMinimo ? 'text-red-600' : 'text-green-600'}`}>{p.estoqueAtual}</span>
                  <span className="text-xs text-gray-300">/{p.estoqueMinimo}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={p.activeFlag ? 'default' : 'secondary'}>{p.activeFlag ? 'Ativo' : 'Inativo'}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setShowFicha(p)} title="Ficha técnica" className="p-1 text-blue-400 hover:text-blue-600 transition-colors">
                      <BookOpen size={14} />
                    </button>
                    <button onClick={() => setConfirmDelete({ id: p.produtoId, nome: p.nome })} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Produto */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">{editando ? 'Editar Produto' : 'Novo Produto'}</h2>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><Label>Nome *</Label><Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" autoFocus /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <select value={tipo} onChange={e => setTipo(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">Gerencie em Cadastros → Domínios</p>
                </div>
                <div>
                  <Label>Unidade</Label>
                  <select value={unidade} onChange={e => setUnidade(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">Gerencie em Cadastros → Domínios</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Preço Varejo (R$)</Label><Input type="number" min="0" step="0.01" value={precoVarejo} onChange={e => setPrecoVarejo(e.target.value)} className="mt-1" /></div>
                <div><Label>Preço Atacado (R$)</Label><Input type="number" min="0" step="0.01" value={precoAtacado} onChange={e => setPrecoAtacado(e.target.value)} className="mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Estoque Atual</Label><Input type="number" min="0" value={estoqueAtual} onChange={e => setEstoqueAtual(e.target.value)} className="mt-1" /></div>
                <div><Label>Estoque Mínimo</Label><Input type="number" min="0" value={estoqueMin} onChange={e => setEstoqueMin(e.target.value)} className="mt-1" /></div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-700">Produto ativo</span>
              </label>
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
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Adicionar Insumo</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Insumo *</Label>
                    <select value={fichaInsumoId} onChange={e => setFichaInsumoId(e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                      <option value="">Selecionar...</option>
                      {insumos.map((ins: any) => <option key={ins.insumoId} value={ins.insumoId}>{ins.nome}</option>)}
                    </select>
                  </div>
                  <div><Label className="text-xs">Quantidade *</Label><Input type="number" min="0" step="0.001" value={fichaQuantidade} onChange={e => setFichaQuantidade(e.target.value)} className="mt-1 h-9 text-sm" placeholder="0.000" /></div>
                  <div>
                    <Label className="text-xs">Unidade</Label>
                    <select value={fichaUnidade} onChange={e => setFichaUnidade(e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                      <option value="">Selecionar...</option>
                      {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <Button size="sm" className="mt-3" onClick={() => addFichaMut.mutate()} disabled={!fichaInsumoId || !fichaQuantidade || addFichaMut.isPending}>
                  <Plus size={13} className="mr-1" /> Adicionar
                </Button>
              </div>
              {fichaItens.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum insumo na ficha técnica. Adicione acima para que o sistema consuma automaticamente ao produzir.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Insumo', 'Qtd / unidade', 'Unidade', ''].map((h, i) => (
                        <th key={i} className={`text-${i === 0 ? 'left' : 'center'} text-xs font-medium text-gray-400 px-3 py-2`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fichaItens.map((item: any) => (
                      <tr key={item.produtoInsumoId ?? item.itemId} className="border-b border-gray-50 group">
                        <td className="px-3 py-2.5 text-sm font-medium text-gray-900">{item.nomeInsumo ?? `Insumo #${item.insumoId}`}</td>
                        <td className="px-3 py-2.5 text-center text-sm text-gray-600">{parseFloat(String(item.quantidade)).toFixed(3)}</td>
                        <td className="px-3 py-2.5 text-center text-sm text-gray-500">{item.unidade}</td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => removeFichaMut.mutate(item.produtoInsumoId ?? item.itemId)}
                            className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
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

      {showImport && (
        <CsvImportModal tenantSlug={tenantSlug} entidade="produtos" nomeEntidade="Produtos"
          onClose={() => setShowImport(false)} onSuccess={() => { invalidate(); setShowImport(false) }} />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Excluir produto"
          message={`Tem certeza que deseja excluir "${confirmDelete.nome}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir" danger
          onConfirm={() => { excluirMut.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}