'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, Download, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface Props { tenantSlug: string }

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

const TIPOS = ['Massa', 'Molho', 'Acompanhamento', 'Bebida', 'Outro']

export default function ProdutosView({ tenantSlug }: Props) {
  const qc  = useQueryClient()
  const api = `/api/${tenantSlug}/cadastros/produtos`
  const [busca, setBusca]         = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showFicha, setShowFicha] = useState<any>(null)
  const [editando, setEditando]   = useState<any>(null)

  const [nome, setNome]                 = useState('')
  const [tipo, setTipo]                 = useState(TIPOS[0])
  const [unidade, setUnidade]           = useState('kg')
  const [precoVarejo, setPrecoVarejo]   = useState('')
  const [precoAtacado, setPrecoAtacado] = useState('')
  const [estoqueMin, setEstoqueMin]     = useState('0')
  const [estoqueAtual, setEstoqueAtual] = useState('0')
  const [ativo, setAtivo]               = useState(true)

  const [fichaInsumoId, setFichaInsumoId]     = useState('')
  const [fichaQuantidade, setFichaQuantidade] = useState('')
  const [fichaUnidade, setFichaUnidade]       = useState('kg')

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
        estoqueMinimo: Number(estoqueMin),
        estoqueAtual:  Number(estoqueAtual),
        activeFlag: ativo,
      }
      if (editando) return fetch(`${api}/${editando.produtoId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json())
      return fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json())
    },
    onSuccess: () => { invalidate(); fecharModal() },
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: invalidate,
  })

  const addFichaMut = useMutation({
    mutationFn: () => fetch(`${api}/${showFicha.produtoId}/ficha`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insumoId: Number(fichaInsumoId), quantidade: parseFloat(fichaQuantidade), unidade: fichaUnidade }),
    }).then(r => r.json()),
    onSuccess: () => { refetchFicha(); setFichaInsumoId(''); setFichaQuantidade('') },
  })

  const removeFichaMut = useMutation({
    mutationFn: (itemId: number) => fetch(`${api}/${showFicha.produtoId}/ficha/${itemId}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => refetchFicha(),
  })

  function abrirModal(item?: any) {
    if (item) {
      setEditando(item)
      setNome(item.nome); setTipo(item.tipo ?? TIPOS[0]); setUnidade(item.unidade ?? 'kg')
      setPrecoVarejo(item.precoVarejo ? (item.precoVarejo / 100).toFixed(2) : '')
      setPrecoAtacado(item.precoAtacado ? (item.precoAtacado / 100).toFixed(2) : '')
      setEstoqueMin(String(item.estoqueMinimo ?? 0))
      setEstoqueAtual(String(item.estoqueAtual ?? 0))
      setAtivo(item.activeFlag ?? true)
    } else {
      setEditando(null); setNome(''); setTipo(TIPOS[0]); setUnidade('kg')
      setPrecoVarejo(''); setPrecoAtacado(''); setEstoqueMin('0'); setEstoqueAtual('0'); setAtivo(true)
    }
    setShowModal(true)
  }

  function fecharModal() { setShowModal(false); setEditando(null) }

  function exportCSV() {
    const rows = todosProdutos.map((p: any) => [p.produtoId, p.nome, p.tipo, p.unidade, p.precoVarejo ? p.precoVarejo / 100 : 0, p.estoqueAtual, p.estoqueMinimo])
    const csv  = [['ID', 'Nome', 'Tipo', 'Unidade', 'Preço', 'Est.Atual', 'Est.Mín'], ...rows].map(r => r.map((c: any) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' })); a.download = 'produtos.csv'; a.click()
  }

  // FIX: API retorna { data: { data: [...], meta: {...} } } com paginação
  const todosProdutos = Array.isArray(raw?.data?.data) ? raw.data.data
    : Array.isArray(raw?.data)    ? raw.data
    : Array.isArray(raw)          ? raw
    : []
  const produtos   = todosProdutos.filter((p: any) => p.nome?.toLowerCase().includes(busca.toLowerCase()))
  const insumos    = Array.isArray(insumosRaw?.data?.data) ? insumosRaw.data.data
    : Array.isArray(insumosRaw?.data) ? insumosRaw.data
    : []
  const fichaItens = Array.isArray(fichaRaw?.data) ? fichaRaw.data
    : Array.isArray(fichaRaw)    ? fichaRaw
    : []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-semibold text-gray-900">Produtos</h1><p className="text-sm text-gray-400 mt-0.5">{todosProdutos.length} cadastrados</p></div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download size={14} className="mr-1.5" /> CSV</Button>
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
              {['Nome', 'Tipo', 'Unidade', 'Preço Varejo', 'Estoque', 'Status', ''].map((h, i) => (
                <th key={i} className={`text-${i === 0 ? 'left' : 'center'} text-xs font-medium text-gray-400 px-4 py-3`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
            ) : produtos.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum produto cadastrado.</td></tr>
            ) : produtos.map((p: any) => (
              <tr key={p.produtoId} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900 cursor-pointer" onClick={() => abrirModal(p)}>{p.nome}</td>
                <td className="px-4 py-3 text-center"><Badge variant="secondary">{p.tipo ?? '—'}</Badge></td>
                <td className="px-4 py-3 text-center text-sm text-gray-500">{p.unidade ?? '—'}</td>
                <td className="px-4 py-3 text-center text-sm font-medium">{p.precoVarejo ? fmt(p.precoVarejo) : '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-sm font-semibold ${p.estoqueAtual <= p.estoqueMinimo ? 'text-red-600' : 'text-green-600'}`}>{p.estoqueAtual}</span>
                  <span className="text-xs text-gray-300">/{p.estoqueMinimo}</span>
                </td>
                <td className="px-4 py-3 text-center"><Badge variant={p.activeFlag ? 'default' : 'secondary'}>{p.activeFlag ? 'Ativo' : 'Inativo'}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => setShowFicha(p)} title="Ficha técnica" className="p-1 text-blue-400 hover:text-blue-600"><BookOpen size={14} /></button>
                    <button onClick={() => { if (confirm(`Excluir "${p.nome}"?`)) excluirMut.mutate(p.produtoId) }} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
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
                    {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div><Label>Unidade</Label><Input value={unidade} onChange={e => setUnidade(e.target.value)} className="mt-1" placeholder="kg, un, cx..." /></div>
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
                <Button onClick={() => salvarMut.mutate()} disabled={!nome || salvarMut.isPending}>{salvarMut.isPending ? 'Salvando...' : 'Salvar'}</Button>
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
                <p className="text-sm text-gray-400 mt-0.5">{showFicha.nome}</p>
              </div>
              <button onClick={() => setShowFicha(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6">
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Adicionar Insumo</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <Label className="text-xs">Insumo *</Label>
                    <select value={fichaInsumoId} onChange={e => setFichaInsumoId(e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                      <option value="">Selecionar...</option>
                      {insumos.map((ins: any) => <option key={ins.insumoId} value={ins.insumoId}>{ins.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Quantidade *</Label>
                    <Input type="number" min="0" step="0.001" value={fichaQuantidade} onChange={e => setFichaQuantidade(e.target.value)} className="mt-1 h-9 text-sm" placeholder="0.000" />
                  </div>
                  <div>
                    <Label className="text-xs">Unidade</Label>
                    <Input value={fichaUnidade} onChange={e => setFichaUnidade(e.target.value)} className="mt-1 h-9 text-sm" placeholder="kg" />
                  </div>
                </div>
                <Button size="sm" className="mt-3" onClick={() => addFichaMut.mutate()}
                  disabled={!fichaInsumoId || !fichaQuantidade || addFichaMut.isPending}>
                  <Plus size={13} className="mr-1" /> Adicionar
                </Button>
              </div>

              {fichaItens.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum insumo na ficha técnica.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Insumo', 'Quantidade', 'Unidade', ''].map((h, i) => (
                        <th key={i} className={`text-${i === 0 ? 'left' : 'center'} text-xs font-medium text-gray-400 px-3 py-2`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fichaItens.map((item: any) => (
                      <tr key={item.produtoInsumoId ?? item.itemId} className="border-b border-gray-50">
                        <td className="px-3 py-2.5 text-sm font-medium text-gray-900">{item.nomeInsumo ?? item.insumo?.nome ?? `Insumo #${item.insumoId}`}</td>
                        <td className="px-3 py-2.5 text-center text-sm text-gray-600">{parseFloat(String(item.quantidade)).toFixed(3)}</td>
                        <td className="px-3 py-2.5 text-center text-sm text-gray-500">{item.unidade}</td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={() => removeFichaMut.mutate(item.produtoInsumoId ?? item.itemId)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
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
    </div>
  )
}