'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, Download, Upload, Package2, ArrowUpDown, Clock, Pencil } from 'lucide-react'
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
import { HistoricoModal } from '@/components/ui/HistoricoModal'
import { AuditoriaInfo } from '@/components/ui/AuditoriaInfo'

interface Props { tenantSlug: string }

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

type SortKey = 'nome' | 'tipo' | 'estoqueAtual' | 'precoCusto'
type SortDir  = 'asc' | 'desc'

export default function InsumosView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/cadastros/insumos`

  const tipos    = useDominio(tenantSlug, 'tipo_insumo',    ['Matéria Prima', 'Embalagem', 'Limpeza', 'Outros'])
  const unidades = useDominio(tenantSlug, 'unidade_medida', ['kg', 'g', 'l', 'ml', 'un', 'cx', 'sc', 'fd'])

  const [busca, setBusca]                 = useState('')
  const [page, setPage]               = useState(1)
  const [limit, setLimit]             = useState(20)
  const [showModal, setShowModal]         = useState(false)
  const [showImport, setShowImport]       = useState(false)
  const [showHistorico, setShowHistorico] = useState<any>(null)
  const [editando, setEditando]           = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; nome: string } | null>(null)
  const [sortKey, setSortKey]             = useState<SortKey>('nome')
  const [sortDir, setSortDir]             = useState<SortDir>('asc')

  const [nome, setNome]             = useState('')
  const [tipo, setTipo]             = useState('')
  const [unidade, setUnidade]       = useState('')
  const [estoqueMin, setEstoqueMin] = useState('0')
  const [precoCusto, setPrecoCusto] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['insumos', tenantSlug] })

  const { data: raw, isLoading } = useQuery({
    queryKey: ['insumos', tenantSlug, page, limit, busca],
    queryFn:  async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (busca) params.set('search', busca)
      return (await fetch(`${api}?${params}`)).json()
    },
  })

  const salvarMut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        nome, tipo,
        estoqueMinimo: Number(estoqueMin),
        precoCusto: precoCusto ? Math.round(parseFloat(precoCusto.replace(',', '.')) * 100) : 0,
      }
      // Unidade só é enviada na criação — não pode ser editada após cadastro
      if (!editando) payload.unidade = unidade

      const url    = editando ? `${api}/${editando.insumoId}` : api
      const method = editando ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao salvar')
      return data
    },
    onSuccess: () => { invalidate(); fecharModal(); toast(editando ? 'Insumo atualizado!' : 'Insumo criado!') },
    onError:   (err: any) => toast(err?.message ?? 'Erro ao salvar insumo.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao excluir')
      return data
    },
    onSuccess: () => { invalidate(); toast('Insumo excluído.') },
    onError:   (err: any) => toast(err?.message ?? 'Erro ao excluir.', 'error'),
  })

  function abrirModal(item?: any) {
    if (item) {
      setEditando(item)
      setNome(item.nome)
      setTipo(item.tipo ?? tipos[0] ?? '')
      setUnidade(item.unidade ?? '')
      setEstoqueMin(String(item.estoqueMinimo ?? 0))
      setPrecoCusto(item.precoCusto ? (item.precoCusto / 100).toFixed(2) : '')
    } else {
      setEditando(null)
      setNome('')
      setTipo(tipos[0] ?? '')
      setUnidade(unidades[0] ?? '')
      setEstoqueMin('0')
      setPrecoCusto('')
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
    const rows = todosInsumos.map((i: any) => [i.insumoId, i.nome, i.tipo ?? '', i.unidade ?? '', i.estoqueAtual, i.estoqueMinimo, i.precoCusto ? (i.precoCusto/100).toFixed(2) : '0'])
    const csv  = [['ID','Nome','Tipo','Unidade','Estoque Atual','Estoque Mínimo','Preço Custo'], ...rows].map(r => r.map((c: any) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv], { type: 'text/csv' })); a.download = 'insumos.csv'; a.click()
  }

  const todosInsumos = Array.isArray(raw?.data?.data) ? raw.data.data : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : []

  const insumos = [...todosInsumos]
    .filter((i: any) => i.nome?.toLowerCase().includes(busca.toLowerCase()))
    .sort((a: any, b: any) => {
      const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'pt-BR')
      return sortDir === 'asc' ? cmp : -cmp
    })

  const criticos = todosInsumos.filter((i: any) => i.estoqueAtual <= i.estoqueMinimo).length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Insumos</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {todosInsumos.length} cadastrados
            {criticos > 0 && <span className="ml-2 text-red-500 font-medium">· {criticos} críticos</span>}
          </p>
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
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 cursor-pointer select-none hover:text-gray-600" onClick={() => toggleSort('nome')}>Nome <SortIcon col="nome" /></th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3 cursor-pointer select-none hover:text-gray-600" onClick={() => toggleSort('tipo')}>Tipo <SortIcon col="tipo" /></th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3">Unidade</th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3 cursor-pointer select-none hover:text-gray-600" onClick={() => toggleSort('estoqueAtual')}>Est. Atual <SortIcon col="estoqueAtual" /></th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3">Est. Mínimo</th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3 cursor-pointer select-none hover:text-gray-600" onClick={() => toggleSort('precoCusto')}>Preço Custo <SortIcon col="precoCusto" /></th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableSkeleton rows={6} cols={7} />
            ) : insumos.length === 0 ? (
              <tr><td colSpan={7}>
                <EmptyState icon={Package2} title="Nenhum insumo cadastrado"
                  description="Cadastre os insumos utilizados na produção para controlar o estoque e a ficha técnica dos produtos."
                  action="Cadastrar primeiro insumo" onAction={() => abrirModal()} />
              </td></tr>
            ) : insumos.map((ins: any) => (
              <tr key={ins.insumoId} className={`group border-b border-gray-50 hover:bg-gray-50/80 transition-colors ${ins.estoqueAtual <= ins.estoqueMinimo ? 'bg-red-50/20' : ''}`}>
                <td className="pl-[10px] pr-4 py-3 border-l-2 border-transparent group-hover:border-green-500 transition-all duration-150">
                  <span className="text-sm font-medium text-gray-900 cursor-pointer hover:text-green-700" onClick={() => abrirModal(ins)}>{ins.nome}</span>
                </td>
                <td className="px-4 py-3 text-center"><Badge variant="secondary">{ins.tipo ?? '—'}</Badge></td>
                <td className="px-4 py-3 text-center text-sm text-gray-500">{ins.unidade ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-sm font-semibold ${ins.estoqueAtual <= ins.estoqueMinimo ? 'text-red-600' : 'text-green-600'}`}>{ins.estoqueAtual}</span>
                </td>
                <td className="px-4 py-3 text-center text-sm text-gray-500">{ins.estoqueMinimo}</td>
                <td className="px-4 py-3 text-center text-sm font-medium text-gray-700">{ins.precoCusto ? fmt(ins.precoCusto) : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => abrirModal(ins)} title="Editar" className="p-1 text-blue-400 hover:text-blue-600"><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDelete({ id: ins.insumoId, nome: ins.nome })} className="p-1 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Paginacao
        page={page}
        totalPages={raw?.data?.meta?.totalPages ?? 1}
        total={raw?.data?.meta?.total ?? insumos.length}
        limit={limit}
        onPage={setPage}
        onLimit={(l) => { setLimit(l); setPage(1) }}
      />

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
                    {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Unidade de Medida</Label>
                  {editando ? (
                    // Unidade não editável após cadastro
                    <div className="mt-1">
                      <Input
                        value={unidade}
                        readOnly
                        className="bg-gray-50 text-gray-500 cursor-not-allowed"
                      />
                      <p className="text-[10px] text-amber-600 mt-1">Unidade não pode ser alterada após cadastro.</p>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <select value={unidade} onChange={e => setUnidade(e.target.value)} className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                        {unidades.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <p className="text-[10px] text-gray-400 mt-1">Não poderá ser alterada após salvar.</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Est. Mínimo</Label><Input type="number" min="0" value={estoqueMin} onChange={e => setEstoqueMin(e.target.value)} className="mt-1" /></div>
                <div><Label>Preço Custo (R$)</Label><Input type="number" min="0" step="0.01" value={precoCusto} onChange={e => setPrecoCusto(e.target.value)} className="mt-1" /></div>
              </div>

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

      {showImport && (
        <ImportacaoModal tenantSlug={tenantSlug} entidade="insumos" queryKey="insumos" onClose={() => setShowImport(false)} />
      )}

      {confirmDelete && (
        <ConfirmModal title="Excluir insumo"
          message={`Tem certeza que deseja excluir "${confirmDelete.nome}"? Isso pode afetar fichas técnicas vinculadas.`}
          confirmLabel="Excluir" danger
          onConfirm={() => { excluirMut.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)} />
      )}

      {showHistorico && (
        <HistoricoModal
          tenantSlug={tenantSlug}
          entidade="insumo"
          entidadeId={showHistorico.insumoId}
          titulo={showHistorico.nome}
          onClose={() => setShowHistorico(null)}
        />
      )}
    </div>
  )
}
