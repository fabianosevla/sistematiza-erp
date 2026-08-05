'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Check, RefreshCw, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormModal } from '@/components/ui/FormModal'
import { Badge } from '@/components/ui/badge'
import { fmtData as fmtDate } from '@/lib/format'

interface Props { tenantSlug: string }


export default function PlanoAcaoView({ tenantSlug }: Props) {
  const qc  = useQueryClient()
  const api = `/api/${tenantSlug}/plano-acao`

  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [busca, setBusca]               = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [editando, setEditando]         = useState<any>(null)
  const [dataAcao, setDataAcao]         = useState(new Date().toISOString().slice(0, 10))
  const [identificacao, setIdentificacao] = useState('')
  const [acao, setAcao]                 = useState('')
  const [responsavel, setResponsavel]   = useState('')

  const { data: raw, isLoading } = useQuery({
    queryKey: ['plano-acao', tenantSlug, filtroStatus, busca],
    queryFn:  async () => {
      const p = new URLSearchParams()
      if (filtroStatus !== 'todos') p.set('status', filtroStatus)
      if (busca) p.set('busca', busca)
      return (await fetch(`${api}?${p}`)).json()
    },
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['plano-acao', tenantSlug] })

  const salvarMut = useMutation({
    mutationFn: async () => {
      const payload = { dataAcao, identificacao, acao, responsavel }
      if (editando) {
        return fetch(`${api}/${editando.acaoId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json())
      }
      return fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json())
    },
    onSuccess: () => { invalidate(); fecharModal() },
  })

  const concluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'concluir' }) }).then(r => r.json()),
    onSuccess: invalidate,
  })

  const reabrirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reabrir' }) }).then(r => r.json()),
    onSuccess: invalidate,
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: invalidate,
  })

  function abrirModal(item?: any) {
    if (item) {
      setEditando(item)
      setDataAcao(item.dataAcao)
      setIdentificacao(item.identificacao)
      setAcao(item.acao)
      setResponsavel(item.responsavel ?? '')
    } else {
      setEditando(null)
      setDataAcao(new Date().toISOString().slice(0, 10))
      setIdentificacao(''); setAcao(''); setResponsavel('')
    }
    setShowModal(true)
  }

  function fecharModal() { setShowModal(false); setEditando(null) }

  // FIX: API retorna { data: [...] }
  const itens = Array.isArray(raw?.data) ? raw.data : []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Plano de Ação</h1>
          <p className="text-sm text-gray-400 mt-0.5">{itens.filter((i: any) => i.status === 'pendente').length} pendentes</p>
        </div>
        <Button onClick={() => abrirModal()}><Plus size={15} className="mr-1.5" /> Nova Ação</Button>
      </div>

      <div className="flex gap-3 mb-4">
        <Input placeholder="Buscar identificação ou responsável..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-xs h-9 text-sm" />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['todos', 'pendente', 'concluido'] as const).map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${filtroStatus === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {s === 'todos' ? 'Todos' : s === 'pendente' ? 'Pendentes' : 'Concluídos'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-28">Data</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-40">Identificação</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Ação</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-32 hidden md:table-cell">Responsável</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-24">Status</th>
              <th className="px-4 py-3 w-32" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
            ) : itens.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Nenhuma ação encontrada.</td></tr>
            ) : itens.map((item: any) => (
              <tr key={item.acaoId}
                className={`border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer ${item.status === 'concluido' ? 'opacity-60' : ''}`}
                onClick={() => abrirModal(item)}>
                <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(item.dataAcao)}</td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-medium px-2 py-1 rounded ${item.status === 'pendente' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                    {item.identificacao}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">{item.acao}</td>
                <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{item.responsavel ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={item.status === 'pendente' ? 'secondary' : 'default'}>
                    {item.status === 'pendente' ? 'Pendente' : 'Concluído'}
                  </Badge>
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button onClick={() => abrirModal(item)} title="Editar" className="p-1 text-gray-300 hover:text-green-600"><Pencil size={14} /></button>
                    {item.status === 'pendente' ? (
                      <button onClick={() => concluirMut.mutate(item.acaoId)} className="p-1 text-green-500 hover:text-green-700"><Check size={14} /></button>
                    ) : (
                      <button onClick={() => reabrirMut.mutate(item.acaoId)} className="p-1 text-amber-500 hover:text-amber-700"><RefreshCw size={14} /></button>
                    )}
                    <button onClick={() => { if (confirm('Excluir?')) excluirMut.mutate(item.acaoId) }} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <FormModal
          titulo={editando ? 'Editar Ação' : 'Nova Ação'}
          onClose={fecharModal}
          largura="max-w-lg"
        >
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data *</Label><Input type="date" value={dataAcao} onChange={e => setDataAcao(e.target.value)} className="mt-1" /></div>
                <div><Label>Identificação *</Label><Input value={identificacao} onChange={e => setIdentificacao(e.target.value)} className="mt-1" placeholder="Ex: MANUTENÇÃO" /></div>
              </div>
              <div>
                <Label>Ação *</Label>
                <textarea value={acao} onChange={e => setAcao(e.target.value)} rows={4}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none"
                  placeholder="Descreva a ação..." />
              </div>
              <div><Label>Responsável</Label><Input value={responsavel} onChange={e => setResponsavel(e.target.value)} className="mt-1" placeholder="Nome do responsável" /></div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
                <Button onClick={() => salvarMut.mutate()} disabled={!dataAcao || !identificacao || !acao || salvarMut.isPending}>
                  {salvarMut.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
        </FormModal>
      )}
    </div>
  )
}