'use client'
// components/modules/financeiro/ContasReceberView.tsx
// Espelho de ContasPagarView mas para recebimentos

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt } from '@/lib/format'

interface Props { tenantSlug: string }


function fmtDate(d: string) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—' }
function isVencida(row: any) {
  return row.status === 'aberta' && row.dataVencimento < new Date().toISOString().slice(0, 10)
}

export default function ContasReceberView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/contas-receber`

  const [filtroStatus, setFiltroStatus] = useState('todas')
  const [busca, setBusca]               = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [showBaixa, setShowBaixa]       = useState<any | null>(null)
  const [confirmDel, setConfirmDel]     = useState<any | null>(null)

  const [form, setForm] = useState({
    descricao: '', nomeCliente: '', categoria: '', numeroDocumento: '',
    valorOriginal: '', dataEmissao: new Date().toISOString().slice(0, 10),
    dataVencimento: '', formaRecebimento: '', observacao: '', totalParcelas: '1',
  })
  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const [baixaForm, setBaixaForm] = useState({
    valorRecebido: '', dataRecebimento: new Date().toISOString().slice(0, 10), formaRecebimento: '',
  })
  const setBF = (k: string, v: string) => setBaixaForm(p => ({ ...p, [k]: v }))

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['contas-receber', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['contas-receber-kpis', tenantSlug] })
  }

  const { data: kpisRaw } = useQuery({
    queryKey: ['contas-receber-kpis', tenantSlug],
    queryFn:  async () => (await fetch(`${api}?tipo=kpis`)).json(),
    refetchInterval: 30000,
  })

  const { data: listRaw, isLoading } = useQuery({
    queryKey: ['contas-receber', tenantSlug, filtroStatus, busca],
    queryFn:  async () => {
      const p = new URLSearchParams({ status: filtroStatus, limit: '50' })
      if (busca) p.set('busca', busca)
      return (await fetch(`${api}?${p}`)).json()
    },
  })

  const criarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, valorOriginal: parseFloat(form.valorOriginal.replace(',', '.')) || 0, totalParcelas: parseInt(form.totalParcelas) || 1 }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => {
      inv(); setShowModal(false)
      setForm({ descricao: '', nomeCliente: '', categoria: '', numeroDocumento: '', valorOriginal: '', dataEmissao: new Date().toISOString().slice(0, 10), dataVencimento: '', formaRecebimento: '', observacao: '', totalParcelas: '1' })
      toast('Conta a receber criada!')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  const baixarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${api}/${showBaixa.contaReceberId}/baixar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valorRecebido: parseFloat(baixaForm.valorRecebido.replace(',', '.')) || 0, dataRecebimento: baixaForm.dataRecebimento, formaRecebimento: baixaForm.formaRecebimento }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => {
      inv(); setShowBaixa(null)
      setBaixaForm({ valorRecebido: '', dataRecebimento: new Date().toISOString().slice(0, 10), formaRecebimento: '' })
      toast('Recebimento registrado!')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess:  () => { inv(); toast('Excluído.') },
  })

  const kpis = kpisRaw?.data
  const rows = Array.isArray(listRaw?.data?.data) ? listRaw.data.data : Array.isArray(listRaw?.data) ? listRaw.data : []

  return (
    <div className="space-y-5">
      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { label: 'A receber',   value: fmt(kpis.aReceber),      sub: `${kpis.qtdAberta} título(s)`,   color: 'text-blue-600' },
            { label: 'Vencidas',    value: fmt(kpis.vencidas),      sub: `${kpis.qtdVencida} título(s)`,  color: 'text-red-600' },
            { label: 'Recebido',    value: fmt(kpis.totalRecebido), sub: `${kpis.qtdRecebida} baixa(s)`,  color: 'text-green-600' },
          ].map((k, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400">{k.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros + botão */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {['todas', 'aberta', 'vencidas', 'recebida', 'cancelada'].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${filtroStatus === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..." className="h-8 text-sm w-48" />
          <Button onClick={() => setShowModal(true)} size="sm">
            <Plus size={14} className="mr-1" /> Nova conta
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {['Descrição', 'Cliente', 'Vencimento', 'Valor', 'Status', ''].map((h, i) => (
                <th key={i} className={`text-left text-xs font-medium text-gray-400 px-4 py-3 ${i === 3 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-10 text-sm text-gray-400">Carregando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-sm text-gray-400">Nenhum título encontrado.</td></tr>
            ) : rows.map((r: any) => {
              const vencida = isVencida(r)
              const saldo   = r.valorOriginal - r.valorRecebido
              return (
                <tr key={r.contaReceberId} className="group border-b border-gray-50 hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{r.descricao}</p>
                    {r.numeroDocumento && <p className="text-xs text-gray-400">Doc: {r.numeroDocumento}</p>}
                    {r.totalParcelas > 1 && <p className="text-xs text-gray-400">{r.parcelaAtual}/{r.totalParcelas} parcelas</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.nomeCliente || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm ${vencida ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                      {fmtDate(r.dataVencimento)}
                    </span>
                    {vencida && <span className="block text-[10px] text-red-500">Vencida</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm font-bold text-gray-900">{fmt(r.valorOriginal)}</p>
                    {r.valorRecebido > 0 && <p className="text-xs text-green-600">Recebido: {fmt(r.valorRecebido)}</p>}
                    {saldo > 0 && saldo < r.valorOriginal && <p className="text-xs text-orange-500">Saldo: {fmt(saldo)}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      vencida ? 'bg-red-100 text-red-700' :
                      r.status === 'recebida' ? 'bg-green-100 text-green-700' :
                      r.status === 'aberta'   ? 'bg-blue-100 text-blue-700'  :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {vencida ? 'Vencida' : r.status === 'recebida' ? 'Recebida' : r.status === 'aberta' ? 'Aberta' : r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                      {r.status !== 'recebida' && (
                        <button onClick={() => { setShowBaixa(r); setBaixaForm({ valorRecebido: ((r.valorOriginal - r.valorRecebido) / 100).toFixed(2), dataRecebimento: new Date().toISOString().slice(0, 10), formaRecebimento: r.formaRecebimento ?? '' }) }}
                          className="p-1 text-green-500 hover:text-green-700" title="Baixar">
                          <CheckCircle size={14} />
                        </button>
                      )}
                      <button onClick={() => setConfirmDel(r)} className="p-1 text-gray-300 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal nova conta */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold">Nova conta a receber</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <Label>Descrição *</Label>
                <Input value={form.descricao} onChange={e => setF('descricao', e.target.value)} className="mt-1" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cliente</Label>
                  <Input value={form.nomeCliente} onChange={e => setF('nomeCliente', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Nº Documento</Label>
                  <Input value={form.numeroDocumento} onChange={e => setF('numeroDocumento', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Input value={form.categoria} onChange={e => setF('categoria', e.target.value)} className="mt-1" placeholder="Ex: Venda, Serviço..." />
                </div>
                <div>
                  <Label>Valor total (R$) *</Label>
                  <Input type="number" value={form.valorOriginal} onChange={e => setF('valorOriginal', e.target.value)} className="mt-1" placeholder="0,00" />
                </div>
                <div>
                  <Label>Data emissão *</Label>
                  <Input type="date" value={form.dataEmissao} onChange={e => setF('dataEmissao', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Vencimento *</Label>
                  <Input type="date" value={form.dataVencimento} onChange={e => setF('dataVencimento', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Parcelas</Label>
                  <Input type="number" min="1" max="48" value={form.totalParcelas} onChange={e => setF('totalParcelas', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Forma de recebimento</Label>
                  <Input value={form.formaRecebimento} onChange={e => setF('formaRecebimento', e.target.value)} className="mt-1" placeholder="PIX, Boleto..." />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 flex-shrink-0">
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button onClick={() => criarMut.mutate()} disabled={!form.descricao || !form.valorOriginal || !form.dataVencimento || criarMut.isPending}>
                {criarMut.isPending ? 'Salvando...' : 'Criar conta'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal baixa */}
      {showBaixa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold">Registrar recebimento</h2>
                <p className="text-xs text-gray-400 mt-0.5">{showBaixa.descricao}</p>
              </div>
              <button onClick={() => setShowBaixa(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                <span className="text-sm text-gray-500">Saldo a receber</span>
                <span className="font-bold text-blue-600">{fmt(showBaixa.valorOriginal - showBaixa.valorRecebido)}</span>
              </div>
              <div>
                <Label>Valor recebido (R$) *</Label>
                <Input type="number" value={baixaForm.valorRecebido} onChange={e => setBF('valorRecebido', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Data recebimento *</Label>
                <Input type="date" value={baixaForm.dataRecebimento} onChange={e => setBF('dataRecebimento', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Forma de recebimento</Label>
                <Input value={baixaForm.formaRecebimento} onChange={e => setBF('formaRecebimento', e.target.value)} className="mt-1" placeholder="PIX, Transferência..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <Button variant="outline" onClick={() => setShowBaixa(null)}>Cancelar</Button>
              <Button onClick={() => baixarMut.mutate()} disabled={!baixaForm.valorRecebido || baixarMut.isPending}>
                {baixarMut.isPending ? 'Registrando...' : 'Confirmar recebimento'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <ConfirmModal title="Excluir conta" message={`Excluir "${confirmDel.descricao}"?`} confirmLabel="Excluir" danger
          onConfirm={() => { excluirMut.mutate(confirmDel.contaReceberId); setConfirmDel(null) }}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}