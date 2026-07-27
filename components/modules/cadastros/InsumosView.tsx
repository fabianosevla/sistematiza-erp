'use client'
import { useState, useEffect } from 'react'
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
import CsvImportModal from '@/components/ui/CsvImportModal'
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
  const [page, setPage]                   = useState(1)
  const [limit, setLimit]                 = useState(20)
  const [showModal, setShowModal]         = useState(false)
  const [showImport, setShowImport]       = useState(false)
  const [showHistorico, setShowHistorico] = useState<any>(null)
  const [editando, setEditando]           = useState<any>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; nome: string } | null>(null)
  const [sortKey, setSortKey]             = useState<SortKey>('nome')
  const [sortDir, setSortDir]             = useState<SortDir>('asc')

  const [nome, setNome]               = useState('')
  const [tipo, setTipo]               = useState('')
  const [unidade, setUnidade]         = useState('')
  const [estoqueMin, setEstoqueMin]   = useState('0')
  const [estoqueAtual, setEstoqueAtual] = useState('0')
  const [precoCusto, setPrecoCusto]   = useState('')
  // CORREÇÃO (dados ocultos): descricao, codigoBarras e fornecedorId existiam
  // no banco mas não apareciam em lugar nenhum da tela.
  const [descricao, setDescricao]       = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')

  // Volta pra página 1 sempre que a busca muda
  useEffect(() => { setPage(1) }, [busca])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['insumos', tenantSlug] })

  // Paginação e busca no SERVIDOR (?page, ?limit, ?search).
  const { data: raw, isLoading } = useQuery({
    queryKey: ['insumos', tenantSlug, page, limit, busca],
    queryFn:  async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (busca) params.set('search', busca)
      return (await fetch(`${api}?${params}`)).json()
    },
  })

  // Fornecedores para o dropdown do campo fornecedorId
  const { data: fornecedoresRaw } = useQuery({
    queryKey: ['fornecedores-select', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/fornecedores?limit=500`)).json(),
  })
  const fornecedores: any[] = Array.isArray(fornecedoresRaw?.data?.data) ? fornecedoresRaw.data.data
    : Array.isArray(fornecedoresRaw?.data) ? fornecedoresRaw.data : []

  const salvarMut = useMutation({
    mutationFn: async () => {
      const payload = {
        nome, tipo, unidade,
        descricao:    descricao.trim() || null,
        codigoBarras: codigoBarras.trim() || null,
        fornecedorId: fornecedorId ? Number(fornecedorId) : null,
        estoqueMinimo: Number(estoqueMin), estoqueAtual: Number(estoqueAtual),
        precoCusto: precoCusto ? Math.round(parseFloat(precoCusto.replace(',', '.')) * 100) : 0,
      }
      const url    = editando ? `${api}/${editando.insumoId}` : api
      const method = editando ? 'PUT' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json   = await res.json()
      // Sem esse check, um 400 "Registro já existente" caía em onSuccess e mostrava "Insumo criado!".
      if (!res.ok) throw new Error(json?.message ?? 'Erro ao salvar insumo')
      return json
    },
    onSuccess: () => { invalidate(); fecharModal(); toast(editando ? 'Insumo atualizado!' : 'Insumo criado!') },
    onError:   (e: any) => toast(e?.message ?? 'Erro ao salvar insumo.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { invalidate(); toast('Insumo excluído.') },
    onError:   () => toast('Erro ao excluir.', 'error'),
  })

  function abrirModal(item?: any) {
    if (item) {
      setEditando(item); setNome(item.nome)
      setTipo(item.tipo ?? tipos[0] ?? ''); setUnidade(item.unidade ?? unidades[0] ?? '')
      setEstoqueMin(String(item.estoqueMinimo ?? 0)); setEstoqueAtual(String(item.estoqueAtual ?? 0))
      setPrecoCusto(item.precoCusto ? (item.precoCusto / 100).toFixed(2) : '')
      setDescricao(item.descricao ?? '')
      setCodigoBarras(item.codigoBarras ?? '')
      setFornecedorId(item.fornecedorId ? String(item.fornecedorId) : '')
    } else {
      setEditando(null); setNome(''); setTipo(tipos[0] ?? ''); setUnidade(unidades[0] ?? '')
      setEstoqueMin('0'); setEstoqueAtual('0'); setPrecoCusto('')
      setDescricao(''); setCodigoBarras(''); setFornecedorId('')
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

  // Exporta TODOS os insumos (não só a página atual)
  async function exportCSV() {
    const res = await fetch(`${api}?limit=100000`)
    const j   = await res.json()
    const all = Array.isArray(j?.data?.data) ? j.data.data : Array.isArray(j?.data) ? j.data : []
    const rows = all.map((i: any) => [i.insumoId, i.nome, i.tipo ?? '', i.unidade ?? '', i.estoqueAtual, i.estoqueMinimo, i.precoCusto ? (i.precoCusto/100).toFixed(2) : '0'])
    const csv  = [['ID','Nome','Tipo','Unidade','Estoque Atual','Estoque Mínimo','Preço Custo'], ...rows].map(r => r.map((c: any) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿'+csv], { type: 'text/csv' })); a.download = 'insumos.csv'; a.click()
  }

  const pagina = Array.isArray(raw?.data?.data) ? raw.data.data : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : []
  const meta   = raw?.data?.meta

  // Ordena apenas a página atual (a busca é feita no servidor)
  const insumos = [...pagina].sort((a: any, b: any) => {
    const av = a[sortKey] ?? ''; const bv = b[sortKey] ?? ''
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'pt-BR')
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Insumos</h1>
          <p className="text-sm text-gray-400 mt-0.5">{meta?.total ?? 0} cadastrados</p>
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
                <EmptyState icon={Package2} title="Nenhum insumo encontrado"
                  description="Cadastre os insumos utilizados na produção para controlar o estoque e a ficha técnica dos produtos."
                  action="Cadastrar primeiro insumo" onAction={() => abrirModal()} />
              </td></tr>
            ) : insumos.map((ins: any) => (
              <tr key={ins.insumoId} className="group border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
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
                    <button onClick={() => setShowHistorico(ins)} title="Histórico" className="p-1 text-purple-400 hover:text-purple-600"><Clock size={14} /></button>
                    <button onClick={() => abrirModal(ins)} title="Editar" className="p-1 text-gray-300 hover:text-green-600 transition-colors"><Pencil size={14} /></button>
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
        totalPages={meta?.totalPages ?? 1}
        total={meta?.total ?? 0}
        limit={limit}
        onPage={setPage}
        onLimit={(l) => { setLimit(l); setPage(1) }}
      />

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
                <div><Label>Código de Barras</Label><Input value={codigoBarras} onChange={e => setCodigoBarras(e.target.value)} className="mt-1" placeholder="EAN" /></div>
                <div>
                  <Label>Fornecedor</Label>
                  <select value={fornecedorId} onChange={e => setFornecedorId(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    <option value="">— Sem fornecedor —</option>
                    {fornecedores.map((f: any) => <option key={f.fornecedorId} value={f.fornecedorId}>{f.nomeFantasia || f.nomeCompleto}</option>)}
                  </select>
                </div>
              </div>
              <div><Label>Descrição</Label><Input value={descricao} onChange={e => setDescricao(e.target.value)} className="mt-1" placeholder="Descrição do insumo (opcional)" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Est. Atual</Label><Input type="number" min="0" value={estoqueAtual} onChange={e => setEstoqueAtual(e.target.value)} className="mt-1" /></div>
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
        <CsvImportModal tenantSlug={tenantSlug} entidade="insumos" nomeEntidade="Insumos"
          onClose={() => setShowImport(false)} onSuccess={() => { invalidate(); setShowImport(false) }} />
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