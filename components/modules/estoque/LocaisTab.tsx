'use client'
// components/modules/estoque/LocaisTab.tsx

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, ArrowRightLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'

interface Props { tenantSlug: string }

export default function LocaisTab({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()

  const [showNovoLocal, setShowNovoLocal] = useState(false)
  const [nomeLocal, setNomeLocal]         = useState('')
  const [descLocal, setDescLocal]         = useState('')

  const [showTransferir, setShowTransferir] = useState(false)
  const [entidade, setEntidade]       = useState<'produto' | 'insumo'>('insumo')
  const [busca, setBusca]             = useState('')
  const [itemSelecionado, setItemSelecionado] = useState<any>(null)
  const [localOrigemId, setLocalOrigemId]   = useState('')
  const [localDestinoId, setLocalDestinoId] = useState('')
  const [quantidade, setQuantidade]   = useState('')

  const { data: locaisRaw, isLoading } = useQuery({
    queryKey: ['estoque-locais', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/estoque/locais`)).json(),
  })

  const { data: transferenciasRaw } = useQuery({
    queryKey: ['estoque-transferencias', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/estoque/locais/transferir`)).json(),
  })

  const { data: itensRaw } = useQuery({
    queryKey: ['estoque-itens-busca', tenantSlug, entidade, busca],
    queryFn:  async () => {
      const endpoint = entidade === 'produto' ? 'cadastros/produtos' : 'cadastros/insumos'
      return (await fetch(`/api/${tenantSlug}/${endpoint}?search=${busca}&limit=8`)).json()
    },
    enabled: busca.length > 0,
  })

  const { data: distribuicaoRaw, isLoading: loadingDistribuicao } = useQuery({
    queryKey: ['estoque-distribuicao', tenantSlug, entidade, itemSelecionado?.produtoId ?? itemSelecionado?.insumoId],
    queryFn:  async () => {
      const id = itemSelecionado.produtoId ?? itemSelecionado.insumoId
      return (await fetch(`/api/${tenantSlug}/estoque/locais/distribuicao?entidade=${entidade}&entidadeId=${id}`)).json()
    },
    enabled: !!itemSelecionado,
  })

  const criarLocalMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/estoque/locais`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeLocal, descricao: descLocal }),
      })
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['estoque-locais', tenantSlug] })
      setShowNovoLocal(false); setNomeLocal(''); setDescLocal('')
      toast('Local criado!')
    },
  })

  const transferirMut = useMutation({
    mutationFn: async () => {
      const id = itemSelecionado.produtoId ?? itemSelecionado.insumoId
      const res = await fetch(`/api/${tenantSlug}/estoque/locais/transferir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localOrigemId: Number(localOrigemId), localDestinoId: Number(localDestinoId),
          entidade, entidadeId: id, nomeEntidade: itemSelecionado.nome, quantidade: parseFloat(quantidade),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['estoque-distribuicao', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['estoque-transferencias', tenantSlug] })
      toast('Transferência realizada!')
      setQuantidade('')
    },
    onError: (e: any) => toast(e.message || 'Erro ao transferir.', 'error'),
  })

  const locais        = Array.isArray(locaisRaw?.data) ? locaisRaw.data : []
  const transferencias = Array.isArray(transferenciasRaw?.data) ? transferenciasRaw.data : []
  const itens          = Array.isArray(itensRaw?.data?.data) ? itensRaw.data.data : Array.isArray(itensRaw?.data) ? itensRaw.data : []
  const distribuicao    = Array.isArray(distribuicaoRaw?.data) ? distribuicaoRaw.data : []

  function fecharTransferir() {
    setShowTransferir(false); setItemSelecionado(null); setBusca(''); setQuantidade('')
    setLocalOrigemId(''); setLocalDestinoId('')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">Locais cadastrados e movimentação entre eles</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowTransferir(true)}>
            <ArrowRightLeft size={13} className="mr-1.5" /> Transferir
          </Button>
          <Button size="sm" onClick={() => setShowNovoLocal(true)}>
            <Plus size={13} className="mr-1.5" /> Novo local
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading ? (
          <p className="text-sm text-gray-400 col-span-4 text-center py-6">Carregando...</p>
        ) : locais.map((l: any) => (
          <div key={l.localId} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-900">{l.nome}</p>
            {l.padrao && <span className="text-[10px] text-green-600 font-medium">Padrão</span>}
            {l.descricao && <p className="text-xs text-gray-400 mt-1">{l.descricao}</p>}
          </div>
        ))}
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-900 mb-3">Últimas transferências</p>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {transferencias.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma transferência registrada ainda.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-2.5">Item</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-2.5">Quantidade</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-2.5">Data</th>
                </tr>
              </thead>
              <tbody>
                {transferencias.map((t: any) => (
                  <tr key={t.transferenciaId} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 text-sm text-gray-900">{t.nomeEntidade}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{parseFloat(t.quantidade).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-400">{new Date(t.dataTransferencia + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNovoLocal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Novo local</h2>
              <button onClick={() => setShowNovoLocal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><Label>Nome</Label><Input value={nomeLocal} onChange={e => setNomeLocal(e.target.value)} className="mt-1" placeholder="Ex: Depósito Externo" /></div>
              <div><Label>Descrição</Label><Input value={descLocal} onChange={e => setDescLocal(e.target.value)} className="mt-1" /></div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <Button variant="outline" onClick={() => setShowNovoLocal(false)}>Cancelar</Button>
              <Button onClick={() => criarLocalMut.mutate()} disabled={!nomeLocal || criarLocalMut.isPending}>Criar</Button>
            </div>
          </div>
        </div>
      )}

      {showTransferir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Transferir entre locais</h2>
              <button onClick={fecharTransferir} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                <button onClick={() => { setEntidade('insumo'); setItemSelecionado(null) }}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${entidade === 'insumo' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>Insumo</button>
                <button onClick={() => { setEntidade('produto'); setItemSelecionado(null) }}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${entidade === 'produto' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>Produto</button>
              </div>

              {!itemSelecionado ? (
                <div>
                  <Label>Buscar item</Label>
                  <Input value={busca} onChange={e => setBusca(e.target.value)} className="mt-1" placeholder="Digite pra buscar..." />
                  {busca && itens.length > 0 && (
                    <div className="mt-1 border border-gray-100 rounded-lg overflow-hidden">
                      {itens.map((it: any) => (
                        <button key={it.produtoId ?? it.insumoId} onClick={() => setItemSelecionado(it)}
                          className="w-full px-3 py-2 hover:bg-gray-50 text-left text-sm">{it.nome}</button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-gray-900">{itemSelecionado.nome}</span>
                    <button onClick={() => setItemSelecionado(null)} className="text-xs text-gray-400 hover:text-gray-600">trocar</button>
                  </div>

                  {loadingDistribuicao ? (
                    <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-300" /></div>
                  ) : (
                    <div className="space-y-1.5">
                      {distribuicao.map((d: any) => (
                        <div key={d.localId} className="flex justify-between text-sm px-1">
                          <span className="text-gray-500">{d.nome}{d.padrao ? ' (padrão)' : ''}</span>
                          <span className="font-medium text-gray-900">{d.quantidade.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">De</Label>
                      <select value={localOrigemId} onChange={e => setLocalOrigemId(e.target.value)}
                        className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-2 text-sm">
                        <option value="">Selecione...</option>
                        {locais.map((l: any) => <option key={l.localId} value={l.localId}>{l.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Para</Label>
                      <select value={localDestinoId} onChange={e => setLocalDestinoId(e.target.value)}
                        className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-2 text-sm">
                        <option value="">Selecione...</option>
                        {locais.map((l: any) => <option key={l.localId} value={l.localId}>{l.nome}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Quantidade</Label>
                    <Input type="number" min="0" step="0.001" value={quantidade} onChange={e => setQuantidade(e.target.value)} className="mt-1" />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <Button variant="outline" onClick={fecharTransferir}>Cancelar</Button>
              <Button
                disabled={!itemSelecionado || !localOrigemId || !localDestinoId || !quantidade || transferirMut.isPending}
                onClick={() => transferirMut.mutate()}>
                {transferirMut.isPending ? 'Transferindo...' : 'Transferir'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}