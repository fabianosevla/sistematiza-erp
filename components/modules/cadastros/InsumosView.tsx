'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface Props { tenantSlug: string }

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

const TIPOS = ['Matéria Prima', 'Embalagem', 'Limpeza', 'Outros']
const UNIDADES = ['kg', 'g', 'l', 'ml', 'un', 'cx', 'sc', 'fd']

export default function InsumosView({ tenantSlug }: Props) {
  const qc  = useQueryClient()
  const api = `/api/${tenantSlug}/cadastros/insumos`
  const [busca, setBusca]         = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editando, setEditando]   = useState<any>(null)

  const [nome, setNome]               = useState('')
  const [tipo, setTipo]               = useState(TIPOS[0])
  const [unidade, setUnidade]         = useState(UNIDADES[0])
  const [estoqueMin, setEstoqueMin]   = useState('0')
  const [estoqueAtual, setEstoqueAtual] = useState('0')
  const [precoCusto, setPrecoCusto]   = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['insumos', tenantSlug] })

  const { data: raw, isLoading } = useQuery({
    queryKey: ['insumos', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
  })

  const salvarMut = useMutation({
    mutationFn: async () => {
      const payload = {
        nome, tipo, unidade,
        estoqueMinimo: Number(estoqueMin),
        estoqueAtual:  Number(estoqueAtual),
        precoCusto: precoCusto ? Math.round(parseFloat(precoCusto.replace(',', '.')) * 100) : 0,
      }
      if (editando) return fetch(`${api}/${editando.insumoId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json())
      return fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json())
    },
    onSuccess: () => { invalidate(); fecharModal() },
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: invalidate,
  })

  function abrirModal(item?: any) {
    if (item) {
      setEditando(item)
      setNome(item.nome); setTipo(item.tipo ?? TIPOS[0]); setUnidade(item.unidade ?? UNIDADES[0])
      setEstoqueMin(String(item.estoqueMinimo ?? 0))
      setEstoqueAtual(String(item.estoqueAtual ?? 0))
      setPrecoCusto(item.precoCusto ? (item.precoCusto / 100).toFixed(2) : '')
    } else {
      setEditando(null); setNome(''); setTipo(TIPOS[0]); setUnidade(UNIDADES[0])
      setEstoqueMin('0'); setEstoqueAtual('0'); setPrecoCusto('')
    }
    setShowModal(true)
  }

  function fecharModal() { setShowModal(false); setEditando(null) }

  function exportCSV() {
    const rows = insumos.map((i: any) => [i.insumoId, i.nome, i.tipo, i.unidade, i.estoqueAtual, i.estoqueMinimo, i.precoCusto ? i.precoCusto / 100 : 0])
    const csv  = [['ID', 'Nome', 'Tipo', 'Unidade', 'Est.Atual', 'Est.Mín', 'Preço Custo'], ...rows].map(r => r.map((c: any) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' })); a.download = 'insumos.csv'; a.click()
  }

  // FIX: API retorna { data: { data: [...], meta: {...} } } com paginação
  const insumos = Array.isArray(raw?.data?.data) ? raw.data.data
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw)       ? raw
    : []

  const filtrados = insumos.filter((i: any) => i.nome?.toLowerCase().includes(busca.toLowerCase()))
  const criticos  = insumos.filter((i: any) => i.estoqueAtual <= i.estoqueMinimo).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Insumos</h1>
          <p className="text-sm text-gray-400 mt-0.5">{insumos.length} cadastrados{criticos > 0 ? ` · ${criticos} críticos` : ''}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download size={14} className="mr-1.5" /> CSV</Button>
          <Button variant="outline" onClick={() => setShowImport(true)}><Upload size={14} className="mr-1.5" /> Importar</Button>
          <Button onClick={() => abrirModal()}><Plus size={15} className="mr-1.5" /> Novo Insumo</Button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <Input placeholder="Buscar insumo..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-xs h-9 text-sm" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {['Nome', 'Tipo', 'Unidade', 'Est. Atual', 'Est. Mínimo', 'Preço Custo', ''].map((h, i) => (
                <th key={i} className={`text-${i === 0 ? 'left' : 'center'} text-xs font-medium text-gray-400 px-4 py-3`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum insumo cadastrado.</td></tr>
            ) : filtrados.map((ins: any) => (
              <tr key={ins.insumoId} className={`border-b border-gray-50 hover:bg-gray-50/50 ${ins.estoqueAtual <= ins.estoqueMinimo ? 'bg-red-50/20' : ''}`}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 cursor-pointer" onClick={() => abrirModal(ins)}>{ins.nome}</td>
                <td className="px-4 py-3 text-center"><Badge variant="secondary">{ins.tipo ?? '—'}</Badge></td>
                <td className="px-4 py-3 text-center text-sm text-gray-500">{ins.unidade ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-sm font-semibold ${ins.estoqueAtual <= ins.estoqueMinimo ? 'text-red-600' : 'text-green-600'}`}>{ins.estoqueAtual}</span>
                </td>
                <td className="px-4 py-3 text-center text-sm text-gray-500">{ins.estoqueMinimo}</td>
                <td className="px-4 py-3 text-center text-sm text-gray-600">{ins.precoCusto ? fmt(ins.precoCusto) : '—'}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => { if (confirm(`Excluir "${ins.nome}"?`)) excluirMut.mutate(ins.insumoId) }} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Insumo */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">{editando ? 'Editar Insumo' : 'Novo Insumo'}</h2>
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
                <div>
                  <Label>Unidade</Label>
                  <select value={unidade} onChange={e => setUnidade(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Est. Atual</Label><Input type="number" min="0" value={estoqueAtual} onChange={e => setEstoqueAtual(e.target.value)} className="mt-1" /></div>
                <div><Label>Est. Mínimo</Label><Input type="number" min="0" value={estoqueMin} onChange={e => setEstoqueMin(e.target.value)} className="mt-1" /></div>
                <div><Label>Preço Custo (R$)</Label><Input type="number" min="0" step="0.01" value={precoCusto} onChange={e => setPrecoCusto(e.target.value)} className="mt-1" /></div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
                <Button onClick={() => salvarMut.mutate()} disabled={!nome || salvarMut.isPending}>{salvarMut.isPending ? 'Salvando...' : 'Salvar'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}