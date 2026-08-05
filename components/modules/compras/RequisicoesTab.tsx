'use client'
// components/modules/compras/RequisicoesTab.tsx

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormModal } from '@/components/ui/FormModal'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { fmtData as fmtDate } from '@/lib/format'

interface Props { tenantSlug: string }

const PRIORIDADE_CFG: Record<string, { label: string; cls: string }> = {
  baixa:   { label: 'Baixa',   cls: 'bg-gray-100 text-gray-600' },
  normal:  { label: 'Normal',  cls: 'bg-gray-100 text-gray-700' },
  alta:    { label: 'Alta',    cls: 'bg-amber-100 text-amber-700' },
  urgente: { label: 'Urgente', cls: 'bg-red-100 text-red-700' },
}
const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700' },
  atendida: { label: 'Atendida', cls: 'bg-green-100 text-green-700' },
  cancelada:{ label: 'Cancelada',cls: 'bg-gray-100 text-gray-500' },
}


interface ItemForm { _key: string; insumoId: number; nomeInsumo: string; quantidade: string; unidade: string }

export default function RequisicoesTab({ tenantSlug }: Props) {
  const qc  = useQueryClient()
  const api = `/api/${tenantSlug}/compras/requisicoes`

  const [filtroStatus, setFiltroStatus] = useState('pendente')
  const [showModal, setShowModal]       = useState(false)
  const [motivo, setMotivo]             = useState('')
  const [prioridade, setPrioridade]     = useState('normal')
  const [dataEntrega, setDataEntrega]   = useState('')
  const [departamento, setDepartamento] = useState('')
  const [itens, setItens]               = useState<ItemForm[]>([])
  const [buscaInsumo, setBuscaInsumo]   = useState('')

  const { data: raw, isLoading } = useQuery({
    queryKey: ['compras-requisicoes', tenantSlug, filtroStatus],
    queryFn:  async () => {
      const p = new URLSearchParams({ status: filtroStatus })
      return (await fetch(`${api}?${p}`)).json()
    },
  })

  const { data: insumosRaw } = useQuery({
    queryKey: ['insumos-requisicao', tenantSlug, buscaInsumo],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/insumos?search=${buscaInsumo}&limit=8`)).json(),
    enabled:  buscaInsumo.length > 0,
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['compras-requisicoes', tenantSlug] })

  const criarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo, prioridade, dataEntrega: dataEntrega || undefined, departamento,
          itens: itens.map(i => ({ insumoId: i.insumoId, nomeInsumo: i.nomeInsumo, quantidade: parseFloat(i.quantidade), unidade: i.unidade })),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => { inv(); fecharModal() },
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetch(`${api}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).then(r => r.json()),
    onSuccess: inv,
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: inv,
  })

  function fecharModal() {
    setShowModal(false); setMotivo(''); setPrioridade('normal'); setDataEntrega(''); setDepartamento(''); setItens([])
  }

  function addInsumo(ins: any) {
    setItens(prev => [...prev, { _key: Math.random().toString(36), insumoId: ins.insumoId, nomeInsumo: ins.nome, quantidade: '1', unidade: ins.unidade }])
    setBuscaInsumo('')
  }

  const requisicoes = Array.isArray(raw?.data) ? raw.data : []
  const insumos     = Array.isArray(insumosRaw?.data?.data) ? insumosRaw.data.data : Array.isArray(insumosRaw?.data) ? insumosRaw.data : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {['pendente', 'atendida', 'cancelada', 'todas'].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filtroStatus === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {s}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowModal(true)}>
          <Plus size={14} className="mr-1.5" /> Nova requisição
        </Button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-gray-400 text-center py-10">Carregando...</p>
        ) : requisicoes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10 bg-white rounded-xl border border-gray-100">Nenhuma requisição encontrada.</p>
        ) : requisicoes.map((r: any) => {
          const pCfg = PRIORIDADE_CFG[r.prioridade] ?? PRIORIDADE_CFG.normal
          const sCfg = STATUS_CFG[r.status] ?? STATUS_CFG.pendente
          return (
            <div key={r.requisicaoId} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{r.motivo || `Requisição #${r.requisicaoId}`}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${pCfg.cls}`}>{pCfg.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sCfg.cls}`}>{sCfg.label}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Solicitado em {fmtDate(r.dataSolicitacao)}
                    {r.dataEntrega && ` · Entrega prevista ${fmtDate(r.dataEntrega)}`}
                    {r.departamento && ` · ${r.departamento}`}
                  </p>
                </div>
                {r.status === 'pendente' && (
                  <div className="flex gap-1">
                    <BotaoIcone titulo="Marcar como atendida" variante="sucesso" tamanho="md"
                      onClick={() => statusMut.mutate({ id: r.requisicaoId, status: 'atendida' })}>
                      <Check size={14} />
                    </BotaoIcone>
                    <BotaoIcone titulo="Excluir requisição" variante="perigo" tamanho="md"
                      onClick={() => excluirMut.mutate(r.requisicaoId)}>
                      <Trash2 size={14} />
                    </BotaoIcone>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(r.itens ?? []).map((item: any) => (
                  <span key={item.itemId} className="px-2 py-1 bg-gray-50 text-gray-600 text-xs rounded-lg">
                    {item.nomeInsumo} — {parseFloat(item.quantidade)} {item.unidade}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal nova requisição */}
      {showModal && (
        <FormModal titulo="Nova requisição de material" onClose={fecharModal} largura="max-w-lg">
          <div className="p-6 space-y-4">
            <div><Label>Motivo</Label><Input value={motivo} onChange={e => setMotivo(e.target.value)} className="mt-1" placeholder="Ex: Reposição semanal" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Prioridade</Label>
                <select value={prioridade} onChange={e => setPrioridade(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  <option value="baixa">Baixa</option><option value="normal">Normal</option>
                  <option value="alta">Alta</option><option value="urgente">Urgente</option>
                </select>
              </div>
              <div><Label>Entrega prevista</Label><Input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} className="mt-1" /></div>
              <div><Label>Departamento</Label><Input value={departamento} onChange={e => setDepartamento(e.target.value)} className="mt-1" placeholder="Produção" /></div>
            </div>

            <div>
              <Label>Adicionar insumo</Label>
              <Input value={buscaInsumo} onChange={e => setBuscaInsumo(e.target.value)} className="mt-1" placeholder="Buscar insumo..." />
              {buscaInsumo && insumos.length > 0 && (
                <div className="mt-1 border border-gray-100 rounded-lg overflow-hidden">
                  {insumos.map((ins: any) => (
                    <button key={ins.insumoId} onClick={() => addInsumo(ins)} className="w-full flex justify-between px-3 py-2 hover:bg-gray-50 text-left">
                      <span className="text-sm">{ins.nome}</span>
                      <span className="text-xs text-gray-400">{ins.unidade}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {itens.length > 0 && (
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                {itens.map(item => (
                  <div key={item._key} className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm flex-1">{item.nomeInsumo}</span>
                    <Input type="number" min="0" step="0.001" value={item.quantidade}
                      onChange={e => setItens(prev => prev.map(i => i._key === item._key ? { ...i, quantidade: e.target.value } : i))}
                      className="w-24 h-8 text-sm" />
                    <span className="text-xs text-gray-400 w-10">{item.unidade}</span>
                    <BotaoIcone titulo="Remover item" variante="perigo" onClick={() => setItens(prev => prev.filter(i => i._key !== item._key))}>
                      <X size={14} />
                    </BotaoIcone>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
              <Button onClick={() => criarMut.mutate()} disabled={itens.length === 0 || criarMut.isPending}>
                {criarMut.isPending ? 'Salvando...' : 'Criar requisição'}
              </Button>
            </div>
          </div>
        </FormModal>
      )}
    </div>
  )
}