'use client'
// ESTE ARQUIVO VAI EM: components/modules/estoque/PerdasTab.tsx

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormModal } from '@/components/ui/FormModal'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt, fmtQtd } from '@/lib/format'

interface Props { tenantSlug: string }

const MOTIVOS = [
  { value: 'vencimento',     label: 'Vencimento' },
  { value: 'quebra',         label: 'Quebra' },
  { value: 'contaminacao',   label: 'Contaminação' },
  { value: 'erro_producao',  label: 'Erro de produção' },
  { value: 'outro',          label: 'Outro' },
]



export default function PerdasTab({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/estoque/perdas`

  const [showModal, setShowModal] = useState(false)
  const [entidade, setEntidade]   = useState<'produto' | 'insumo'>('insumo')
  const [busca, setBusca]         = useState('')
  const [itemSelecionado, setItemSelecionado] = useState<any>(null)
  const [quantidade, setQuantidade] = useState('')
  const [motivo, setMotivo]         = useState('vencimento')
  const [observacao, setObservacao] = useState('')

  const { data: raw, isLoading } = useQuery({
    queryKey: ['estoque-perdas', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
  })

  const { data: itensRaw } = useQuery({
    queryKey: ['perda-itens-busca', tenantSlug, entidade, busca],
    queryFn:  async () => {
      const endpoint = entidade === 'produto' ? 'cadastros/produtos' : 'cadastros/insumos'
      return (await fetch(`/api/${tenantSlug}/${endpoint}?search=${busca}&limit=8`)).json()
    },
    enabled: busca.length > 0,
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['estoque-perdas', tenantSlug] })

  // O painel continua aberto após registrar: limpa os campos para lançar a
  // próxima perda em sequência.
  const registrarMut = useMutation({
    mutationFn: async () => {
      const id = itemSelecionado.produtoId ?? itemSelecionado.insumoId
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entidade, entidadeId: id, quantidade: parseFloat(quantidade), motivo, observacao }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => {
      inv()
      limparFormulario()
      toast('Perda registrada — estoque já atualizado.')
    },
    onError: (e: any) => toast(e.message || 'Erro ao registrar.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: inv,
  })

  function limparFormulario() {
    setItemSelecionado(null); setBusca(''); setQuantidade(''); setMotivo('vencimento'); setObservacao('')
  }

  function fecharPainel() {
    setShowModal(false); limparFormulario()
  }

  const perdas = raw?.data?.data ?? []
  const kpis   = raw?.data?.kpis
  const itens  = Array.isArray(itensRaw?.data?.data) ? itensRaw.data.data : Array.isArray(itensRaw?.data) ? itensRaw.data : []

  return (
    <div className="space-y-4">
      {kpis && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">Registros</p>
            <p className="text-xl font-bold text-gray-900">{kpis.totalRegistros}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">Valor perdido</p>
            <p className="text-xl font-bold text-red-500">{fmt(kpis.valorTotal)}</p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowModal(true)}>
          <Plus size={13} className="mr-1.5" /> Registrar perda
        </Button>
      </div>

      {/* Cabeçalho congelado: o contêiner que rola é a div, e cada th é
          sticky com inset shadow no lugar da borda. */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 380px)', minHeight: '160px' }}>
          <table className="w-full">
            <thead>
              <tr>
                <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left  text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5">Item</th>
                <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5">Qtd</th>
                <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left  text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5">Motivo</th>
                <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left  text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5">Data</th>
                <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5">Valor</th>
                <th className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm text-gray-400">Carregando...</td></tr>
              ) : perdas.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm text-gray-400">Nenhuma perda registrada.</td></tr>
              ) : perdas.map((p: any) => (
                <tr key={p.perdaId} className="border-b border-gray-50">
                  <td className="px-4 py-2.5 text-sm text-gray-900">{p.nomeEntidade}</td>
                  <td className="px-4 py-2.5 text-right text-sm text-gray-600">{fmtQtd(p.quantidade)}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{MOTIVOS.find(m => m.value === p.motivo)?.label ?? p.motivo}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-400">{new Date(p.dataPerda + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-medium text-red-500">{fmt(p.valorEstimado)}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => excluirMut.mutate(p.perdaId)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Painel Registrar perda — continua aberto após salvar */}
      {showModal && (
        <FormModal titulo="Registrar perda" onClose={fecharPainel} largura="max-w-md">
          <div className="p-6 space-y-4">
            <div className="flex gap-2">
              <button onClick={() => { setEntidade('insumo'); setItemSelecionado(null) }}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${entidade === 'insumo' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>Insumo</button>
              <button onClick={() => { setEntidade('produto'); setItemSelecionado(null) }}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${entidade === 'produto' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>Produto</button>
            </div>

            {!itemSelecionado ? (
              <div>
                <Label>Item *</Label>
                <Input value={busca} onChange={e => setBusca(e.target.value)} className="mt-1" placeholder="Buscar..." autoFocus />
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
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-gray-900">{itemSelecionado.nome}</span>
                <button onClick={() => setItemSelecionado(null)} className="text-xs text-gray-400 hover:text-gray-600">trocar</button>
              </div>
            )}

            <div>
              <Label>Quantidade *</Label>
              <Input type="number" min="0" step="0.001" value={quantidade} onChange={e => setQuantidade(e.target.value)} className="mt-1 sem-spinner" />
            </div>

            <div>
              <Label>Motivo</Label>
              <select value={motivo} onChange={e => setMotivo(e.target.value)} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm">
                {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div>
              <Label>Observação</Label>
              <Input value={observacao} onChange={e => setObservacao(e.target.value)} className="mt-1" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={fecharPainel}>Cancelar</Button>
              <Button disabled={!itemSelecionado || !quantidade || registrarMut.isPending} onClick={() => registrarMut.mutate()}>
                {registrarMut.isPending ? 'Salvando...' : 'Registrar'}
              </Button>
            </div>
          </div>
        </FormModal>
      )}
    </div>
  )
}