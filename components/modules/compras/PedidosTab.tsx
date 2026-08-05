'use client'
// components/modules/compras/PedidosTab.tsx

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, PackageCheck, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'
import { FormModal } from '@/components/ui/FormModal'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { fmtMoeda as fmt, fmtData as fmtDate } from '@/lib/format'

interface Props {
  tenantSlug:           string
  onIniciarConferencia: (pedidoId: number) => void
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  aberto:            { label: 'Aberto',            cls: 'bg-gray-100 text-gray-700' },
  recebido_parcial:  { label: 'Recebido parcial',  cls: 'bg-amber-100 text-amber-700' },
  recebido:          { label: 'Recebido',          cls: 'bg-green-100 text-green-700' },
  cancelado:         { label: 'Cancelado',         cls: 'bg-gray-100 text-gray-500' },
}


interface ItemForm { _key: string; insumoId?: number; nomeInsumo: string; quantidade: string; precoUnitario: string }

export default function PedidosTab({ tenantSlug, onIniciarConferencia }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/compras/pedidos`

  const [filtroStatus, setFiltroStatus] = useState('aberto')
  const [showModal, setShowModal]       = useState(false)
  const [nomeFornecedor, setNomeFornecedor] = useState('')
  const [previsaoEntrega, setPrevisaoEntrega] = useState('')
  const [itens, setItens]               = useState<ItemForm[]>([])
  const [buscaInsumo, setBuscaInsumo]   = useState('')

  const { data: raw, isLoading } = useQuery({
    queryKey: ['compras-pedidos', tenantSlug, filtroStatus],
    queryFn:  async () => {
      const p = new URLSearchParams({ status: filtroStatus })
      return (await fetch(`${api}?${p}`)).json()
    },
  })

  const { data: insumosRaw } = useQuery({
    queryKey: ['insumos-pedido', tenantSlug, buscaInsumo],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/insumos?search=${buscaInsumo}&limit=8`)).json(),
    enabled:  buscaInsumo.length > 0,
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['compras-pedidos', tenantSlug] })

  const criarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeFornecedor, previsaoEntrega: previsaoEntrega || undefined,
          itens: itens.map(i => ({
            insumoId: i.insumoId, nomeInsumo: i.nomeInsumo,
            quantidade: parseFloat(i.quantidade), precoUnitario: parseFloat(i.precoUnitario),
          })),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => { inv(); fecharModal(); toast('Pedido criado!') },
    onError: (e: any) => toast(e.message || 'Erro ao criar pedido.', 'error'),
  })

  const cancelarMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'cancelar' }),
    }).then(r => r.json()),
    onSuccess: inv,
  })

  const iniciarConferenciaMut = useMutation({
    mutationFn: async (pedidoId: number) => {
      const res = await fetch(`/api/${tenantSlug}/compras/conferencias`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return { pedidoId, ...d }
    },
    onSuccess: (d) => { onIniciarConferencia(d.pedidoId) },
    onError: (e: any) => toast(e.message || 'Erro ao iniciar conferência.', 'error'),
  })

  function fecharModal() {
    setShowModal(false); setNomeFornecedor(''); setPrevisaoEntrega(''); setItens([])
  }

  function addInsumo(ins: any) {
    setItens(prev => [...prev, { _key: Math.random().toString(36), insumoId: ins.insumoId, nomeInsumo: ins.nome, quantidade: '1', precoUnitario: ins.precoCusto ? (ins.precoCusto / 100).toFixed(2) : '' }])
    setBuscaInsumo('')
  }

  const pedidos  = Array.isArray(raw?.data) ? raw.data : []
  const insumos  = Array.isArray(insumosRaw?.data?.data) ? insumosRaw.data.data : Array.isArray(insumosRaw?.data) ? insumosRaw.data : []
  const totalForm = itens.reduce((a, i) => a + (parseFloat(i.quantidade) || 0) * (parseFloat(i.precoUnitario) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {['aberto', 'recebido_parcial', 'recebido', 'cancelado', 'todas'].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filtroStatus === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {STATUS_CFG[s]?.label ?? 'Todas'}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowModal(true)}>
          <Plus size={14} className="mr-1.5" /> Pedido manual
        </Button>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-gray-400 text-center py-10">Carregando...</p>
        ) : pedidos.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10 bg-white rounded-xl border border-gray-100">Nenhum pedido encontrado.</p>
        ) : pedidos.map((p: any) => {
          const sCfg = STATUS_CFG[p.status] ?? STATUS_CFG.aberto
          return (
            <div key={p.pedidoId} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{p.nomeFornecedor}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sCfg.cls}`}>{sCfg.label}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Pedido #{p.pedidoId} · {fmtDate(p.dataPedido)} · {p.totalItens} item(ns)
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold" style={{ color: '#2ecc71' }}>{fmt(p.valorTotal)}</p>
                </div>
              </div>
              {p.status === 'aberto' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                  <Button size="sm" variant="outline" onClick={() => iniciarConferenciaMut.mutate(p.pedidoId)}>
                    <PackageCheck size={13} className="mr-1.5" /> Iniciar Conferência
                  </Button>
                  <button onClick={() => cancelarMut.mutate(p.pedidoId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Ban size={13} /> Cancelar
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showModal && (
        <FormModal titulo="Pedido de compra manual" onClose={fecharModal} largura="max-w-lg">
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Fornecedor</Label><Input value={nomeFornecedor} onChange={e => setNomeFornecedor(e.target.value)} className="mt-1" placeholder="Nome do fornecedor" /></div>
              <div><Label>Previsão de entrega</Label><Input type="date" value={previsaoEntrega} onChange={e => setPrevisaoEntrega(e.target.value)} className="mt-1" /></div>
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
                    <span className="text-sm flex-1 truncate">{item.nomeInsumo}</span>
                    <Input type="number" min="0" step="0.001" value={item.quantidade}
                      onChange={e => setItens(prev => prev.map(i => i._key === item._key ? { ...i, quantidade: e.target.value } : i))}
                      className="w-20 h-8 text-sm" placeholder="Qtd" />
                    <Input type="number" min="0" step="0.01" value={item.precoUnitario}
                      onChange={e => setItens(prev => prev.map(i => i._key === item._key ? { ...i, precoUnitario: e.target.value } : i))}
                      className="w-24 h-8 text-sm" placeholder="R$" />
                    <BotaoIcone titulo="Remover item" variante="perigo" onClick={() => setItens(prev => prev.filter(i => i._key !== item._key))}>
                      <Trash2 size={13} />
                    </BotaoIcone>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2 bg-gray-50">
                  <span className="text-xs text-gray-500">Total</span>
                  <span className="text-sm font-bold text-gray-900">{fmt(Math.round(totalForm * 100))}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
              <Button onClick={() => criarMut.mutate()} disabled={!nomeFornecedor || itens.length === 0 || criarMut.isPending}>
                {criarMut.isPending ? 'Salvando...' : 'Criar pedido'}
              </Button>
            </div>
          </div>
        </FormModal>
      )}
    </div>
  )
}