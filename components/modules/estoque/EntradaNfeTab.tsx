'use client'
// components/modules/estoque/EntradaNfeTab.tsx

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, CheckCircle, Loader2, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/Toast'

interface Props { tenantSlug: string }

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pendente:   { label: 'Aguardando mapeamento', cls: 'bg-amber-100 text-amber-700' },
  processada: { label: 'Processada',            cls: 'bg-green-100 text-green-700' },
}

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

export default function EntradaNfeTab({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/estoque/entrada-nfe`
  const fileRef   = useRef<HTMLInputElement>(null)

  const [entradaId, setEntradaId]   = useState<number | null>(null)
  const [uploading, setUploading]   = useState(false)
  const [buscaInsumo, setBuscaInsumo] = useState<Record<number, string>>({})

  const { data: listRaw, isLoading: loadingList } = useQuery({
    queryKey: ['estoque-nfe-list', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
    enabled:  !entradaId,
  })

  const { data: detailRaw, refetch: refetchDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['estoque-nfe-detail', tenantSlug, entradaId],
    queryFn:  async () => (await fetch(`${api}/${entradaId}`)).json(),
    enabled:  !!entradaId,
  })

  const { data: insumosRaw } = useQuery({
    queryKey: ['estoque-nfe-insumos-busca', tenantSlug, JSON.stringify(buscaInsumo)],
    queryFn:  async () => ({}), // placeholder, busca real é feita inline abaixo por item
    enabled:  false,
  })

  async function buscarInsumos(query: string) {
    if (!query) return []
    const res = await fetch(`/api/${tenantSlug}/cadastros/insumos?search=${query}&limit=6`)
    const d = await res.json()
    return Array.isArray(d?.data?.data) ? d.data.data : Array.isArray(d?.data) ? d.data : []
  }

  const uploadMut = useMutation({
    mutationFn: async (xmlContent: string) => {
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xmlContent }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: (d) => {
      setEntradaId(d.data.entradaId)
      qc.invalidateQueries({ queryKey: ['estoque-nfe-list', tenantSlug] })
      toast('XML importado! Agora vincule cada item a um insumo.')
    },
    onError: (e: any) => toast(e.message || 'Erro ao processar XML.', 'error'),
    onSettled: () => setUploading(false),
  })

  const mapearMut = useMutation({
    mutationFn: async ({ itemId, insumoId }: { itemId: number; insumoId: number }) => {
      const res = await fetch(`${api}/${entradaId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'mapear-item', itemId, insumoId }),
      })
      return res.json()
    },
    onSuccess: () => refetchDetail(),
  })

  const confirmarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${api}/${entradaId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'confirmar' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: (d) => {
      toast(`Entrada confirmada! Estoque atualizado e Conta a Pagar #${d.data.contaPagarId} gerada.`)
      qc.invalidateQueries({ queryKey: ['estoque-nfe-list', tenantSlug] })
      setEntradaId(null)
    },
    onError: (e: any) => toast(e.message || 'Erro ao confirmar.', 'error'),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = (ev) => uploadMut.mutate(ev.target?.result as string)
    reader.readAsText(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  const entradas = Array.isArray(listRaw?.data) ? listRaw.data : []
  const detail    = detailRaw?.data

  // ── Lista de entradas ────────────────────────────────────────────────────
  if (!entradaId) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
          <Upload size={28} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 mb-3">Selecione o arquivo XML da NF-e do fornecedor</p>
          <input ref={fileRef} type="file" accept=".xml" onChange={handleFileChange} className="hidden" id="nfe-upload" />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Processando...</> : 'Selecionar XML'}
          </Button>
        </div>

        <div className="space-y-2">
          {loadingList ? (
            <p className="text-sm text-gray-400 text-center py-6">Carregando...</p>
          ) : entradas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhuma entrada de NF-e ainda.</p>
          ) : entradas.map((e: any) => {
            const sCfg = STATUS_CFG[e.status] ?? STATUS_CFG.pendente
            return (
              <button key={e.entradaId} onClick={() => setEntradaId(e.entradaId)}
                className="w-full flex items-center justify-between bg-white rounded-xl border border-gray-100 hover:border-green-300 p-4 text-left transition-colors">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet size={16} className="text-gray-300" />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{e.nomeFornecedor || 'Fornecedor não identificado'}</span>
                    <span className="text-xs text-gray-400 ml-2">NF-e {e.numeroNfe} · {fmt(e.valorTotal)}</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sCfg.cls}`}>{sCfg.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Mapeamento de itens ──────────────────────────────────────────────────
  if (loadingDetail || !detail) {
    return <div className="flex justify-center py-12"><Loader2 size={18} className="text-gray-300 animate-spin" /></div>
  }

  const todosMapeados = detail.itens.every((i: any) => i.insumoId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{detail.nomeFornecedor} — NF-e {detail.numeroNfe}</p>
          <p className="text-xs text-gray-400">Vincule cada item da nota a um insumo do cadastro</p>
        </div>
        <button onClick={() => setEntradaId(null)} className="text-xs text-gray-400 hover:text-gray-600">← voltar</button>
      </div>

      <div className="space-y-2">
        {detail.itens.map((item: any) => (
          <ItemMapeamento
            key={item.itemId}
            item={item}
            tenantSlug={tenantSlug}
            onMapear={(insumoId) => mapearMut.mutate({ itemId: item.itemId, insumoId })}
          />
        ))}
      </div>

      {detail.status === 'pendente' && (
        <div className="flex justify-end">
          <Button disabled={!todosMapeados || confirmarMut.isPending} onClick={() => confirmarMut.mutate()}>
            {confirmarMut.isPending
              ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Confirmando...</>
              : <><CheckCircle size={14} className="mr-1.5" /> Confirmar Entrada</>
            }
          </Button>
        </div>
      )}
      {!todosMapeados && detail.status === 'pendente' && (
        <p className="text-xs text-amber-500 text-right">Vincule todos os itens a um insumo antes de confirmar.</p>
      )}
      {detail.status === 'processada' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <CheckCircle size={18} className="text-green-600 mx-auto mb-1" />
          <p className="text-sm text-green-700">Entrada já processada — estoque atualizado e conta a pagar gerada.</p>
        </div>
      )}
    </div>
  )
}

function ItemMapeamento({ item, tenantSlug, onMapear }: { item: any; tenantSlug: string; onMapear: (insumoId: number) => void }) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [nomeInsumoSelecionado, setNomeInsumoSelecionado] = useState(item.nomeInsumoMapeado ?? '')

  async function handleBusca(value: string) {
    setBusca(value)
    if (!value) { setResultados([]); return }
    const res = await fetch(`/api/${tenantSlug}/cadastros/insumos?search=${value}&limit=6`)
    const d = await res.json()
    setResultados(Array.isArray(d?.data?.data) ? d.data.data : Array.isArray(d?.data) ? d.data : [])
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-gray-900">{item.descricaoXml}</p>
          <p className="text-xs text-gray-400">Qtd: {Number(item.quantidade).toFixed(2)} · {fmt(item.valorUnitario)}/un</p>
        </div>
        {item.insumoId && <CheckCircle size={16} className="text-green-500 flex-shrink-0" />}
      </div>

      {item.insumoId ? (
        <div className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
          <span className="text-sm text-green-700">{nomeInsumoSelecionado || 'Insumo vinculado'}</span>
        </div>
      ) : (
        <div>
          <Input value={busca} onChange={e => handleBusca(e.target.value)} placeholder="Buscar insumo pra vincular..." className="h-8 text-sm" />
          {resultados.length > 0 && (
            <div className="mt-1 border border-gray-100 rounded-lg overflow-hidden">
              {resultados.map((ins: any) => (
                <button key={ins.insumoId} onClick={() => { onMapear(ins.insumoId); setNomeInsumoSelecionado(ins.nome) }}
                  className="w-full px-3 py-2 hover:bg-gray-50 text-left text-sm">{ins.nome}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}