'use client'
// components/modules/fiscal/NovaNotaModal.tsx
//
// Emissão manual de nota — fora do fluxo automático de venda. Útil pra
// notas avulsas, complementares ou de teste em homologação. Só NFC-e e
// NF-e: o payload de emissão (FiscalService.emitirViaFocusNfe) não tem
// mapeamento de campos de serviço, então NFS-e fica de fora por segurança.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'

interface Props {
  tenantSlug:  string
  tipoInicial: 'NFC-e' | 'NF-e'
  onClose:     () => void
}

interface ItemNota {
  _key:          string
  produtoId?:    number
  descricao:     string
  quantidade:    number
  precoUnitario: string
}

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

export default function NovaNotaModal({ tenantSlug, tipoInicial, onClose }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()

  const [tipo, setTipo]                 = useState<'NFC-e' | 'NF-e'>(tipoInicial)
  const [cnpjCpf, setCnpjCpf]           = useState('')
  const [razaoSocial, setRazaoSocial]   = useState('')
  const [uf, setUf]                     = useState('')
  const [buscaProduto, setBuscaProduto] = useState('')
  const [itens, setItens]               = useState<ItemNota[]>([])

  const { data: produtosRaw } = useQuery({
    queryKey: ['fiscal-nota-produtos', tenantSlug, buscaProduto],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos?search=${encodeURIComponent(buscaProduto)}&limit=8`)).json(),
    enabled:  buscaProduto.length > 0,
  })
  const produtos = Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data : Array.isArray(produtosRaw?.data) ? produtosRaw.data : []

  function addProduto(p: any) {
    setItens(prev => [...prev, {
      _key: Math.random().toString(36).slice(2),
      produtoId: p.produtoId, descricao: p.nome, quantidade: 1,
      precoUnitario: p.precoVarejo ? (p.precoVarejo / 100).toFixed(2) : '0.00',
    }])
    setBuscaProduto('')
  }

  const valorTotal = itens.reduce((a, i) => a + i.quantidade * Math.round(parseFloat(i.precoUnitario.replace(',', '.') || '0') * 100), 0)

  const criarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/fiscal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          cnpjCpf: cnpjCpf || undefined,
          razaoSocial: razaoSocial || undefined,
          uf: uf || undefined,
          valorTotal,
          itens: itens.map(i => ({
            descricao:     i.descricao,
            quantidade:    i.quantidade,
            precoUnitario: Math.round(parseFloat(i.precoUnitario.replace(',', '.') || '0') * 100),
          })),
          emitir: false,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notas', tenantSlug] })
      toast('Nota criada como pendente — emita quando estiver pronta.')
      onClose()
    },
    onError: (e: any) => toast(e.message || 'Erro ao criar nota.', 'error'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-semibold">Nova nota fiscal</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <Label>Tipo *</Label>
            <select value={tipo} onChange={e => setTipo(e.target.value as any)}
              className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
              <option value="NFC-e">NFC-e — Consumidor</option>
              <option value="NF-e">NF-e — Saída (B2B)</option>
            </select>
          </div>

          {tipo === 'NF-e' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Label>Destinatário</Label><Input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} className="mt-1" placeholder="Razão social" /></div>
              <div><Label>UF</Label><Input value={uf} onChange={e => setUf(e.target.value.toUpperCase().slice(0,2))} className="mt-1" maxLength={2} /></div>
              <div className="col-span-3"><Label>CNPJ / CPF</Label><Input value={cnpjCpf} onChange={e => setCnpjCpf(e.target.value)} className="mt-1" /></div>
            </div>
          )}

          <div>
            <Label>Adicionar produto</Label>
            <Input value={buscaProduto} onChange={e => setBuscaProduto(e.target.value)} className="mt-1" placeholder="Buscar produto..." />
            {buscaProduto && produtos.length > 0 && (
              <div className="mt-1 border border-gray-100 rounded-lg overflow-hidden">
                {produtos.map((p: any) => (
                  <button key={p.produtoId} onClick={() => addProduto(p)} className="w-full flex justify-between px-3 py-2 hover:bg-gray-50 text-left text-sm">
                    <span>{p.nome}</span>
                    <span className="text-gray-400">{p.precoVarejo ? fmt(p.precoVarejo) : '—'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {itens.length > 0 && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              {itens.map(item => (
                <div key={item._key} className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm flex-1 truncate">{item.descricao}</span>
                  <Input type="number" min="1" value={item.quantidade}
                    onChange={e => setItens(prev => prev.map(i => i._key === item._key ? { ...i, quantidade: Math.max(1, Number(e.target.value)) } : i))}
                    className="w-16 h-8 text-sm" />
                  <Input type="number" min="0" step="0.01" value={item.precoUnitario}
                    onChange={e => setItens(prev => prev.map(i => i._key === item._key ? { ...i, precoUnitario: e.target.value } : i))}
                    className="w-24 h-8 text-sm" />
                  <button onClick={() => setItens(prev => prev.filter(i => i._key !== item._key))} className="text-gray-300 hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div className="flex justify-between px-3 py-2 bg-gray-50">
                <span className="text-xs text-gray-500">Total</span>
                <span className="text-sm font-bold text-gray-900">{fmt(valorTotal)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-100 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => criarMut.mutate()} disabled={itens.length === 0 || criarMut.isPending}>
            {criarMut.isPending ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Criando...</> : 'Criar nota (pendente)'}
          </Button>
        </div>
      </div>
    </div>
  )
}