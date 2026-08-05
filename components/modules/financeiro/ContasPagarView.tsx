'use client'
// components/modules/financeiro/ContasPagarView.tsx

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { SidePanel } from '@/components/ui/SidePanel'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt, fmtData as fmtDate } from '@/lib/format'

interface Props { tenantSlug: string }

function isVencida(row: any) {
  return row.status === 'aberta' && row.dataVencimento < new Date().toISOString().slice(0, 10)
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  aberta:    { label: 'Aberta',    cls: 'bg-gray-100 text-gray-700' },
  paga:      { label: 'Paga',      cls: 'bg-green-100 text-green-700' },
  cancelada: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-500' },
}

const FORM_VAZIO = {
  descricao: '', nomeFornecedor: '', categoria: '', numeroDocumento: '',
  valorOriginal: '', dataEmissao: new Date().toISOString().slice(0, 10),
  dataVencimento: '', formaPagamento: '', observacao: '', totalParcelas: '1',
}

export default function ContasPagarView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/contas-pagar`

  const [filtroStatus, setFiltroStatus] = useState('todas')
  const [busca, setBusca]               = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [showBaixa, setShowBaixa]       = useState<any | null>(null)
  const [confirmDel, setConfirmDel]     = useState<any | null>(null)

  const [form, setForm] = useState({ ...FORM_VAZIO })
  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const [baixaForm, setBaixaForm] = useState({
    valorPago: '', dataPagamento: new Date().toISOString().slice(0, 10), formaPagamento: '',
  })
  const setBF = (k: string, v: string) => setBaixaForm(p => ({ ...p, [k]: v }))

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['contas-pagar', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['contas-pagar-kpis', tenantSlug] })
  }

  const { data: kpisRaw } = useQuery({
    queryKey: ['contas-pagar-kpis', tenantSlug],
    queryFn:  async () => (await fetch(`${api}?tipo=kpis`)).json(),
    refetchInterval: 30000,
  })

  const { data: listRaw, isLoading } = useQuery({
    queryKey: ['contas-pagar', tenantSlug, filtroStatus, busca],
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
      inv()
      // O painel NÃO fecha ao salvar, e o formulário é limpo: lançar conta a
      // pagar é tarefa em série — chegam várias notas de uma vez — e fechar a
      // cada uma obrigaria a reabrir o painel toda hora.
      setForm({ ...FORM_VAZIO })
      toast('Conta a pagar criada!')
    },
    onError:   (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  const baixarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${api}/${showBaixa.contaPagarId}/baixar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valorPago: parseFloat(baixaForm.valorPago.replace(',', '.')) || 0, dataPagamento: baixaForm.dataPagamento, formaPagamento: baixaForm.formaPagamento }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    // A baixa FECHA: é uma ação pontual sobre um título específico, e depois
    // dela não há o que continuar editando naquele painel.
    onSuccess: () => { inv(); setShowBaixa(null); setBaixaForm({ valorPago: '', dataPagamento: new Date().toISOString().slice(0, 10), formaPagamento: '' }); toast('Baixa registrada!') },
    onError:   (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { inv(); toast('Excluído.') },
  })

  const kpis = kpisRaw?.data
  const rows = Array.isArray(listRaw?.data?.data) ? listRaw.data.data : Array.isArray(listRaw?.data) ? listRaw.data : []

  return (
    <div className="space-y-5">
      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { label: 'A pagar',  value: fmt(kpis.aPagar),    sub: `${kpis.qtdAberta} título(s)`,  color: 'text-gray-900' },
            { label: 'Vencidas', value: fmt(kpis.vencidas),  sub: `${kpis.qtdVencida} título(s)`, color: 'text-red-600' },
            { label: 'Pago no mês', value: fmt(kpis.totalPago), sub: `${kpis.qtdPaga} baixa(s)`,  color: 'text-gray-900' },
          ].map((k, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400">{k.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Header + filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {['todas', 'aberta', 'vencidas', 'paga', 'cancelada'].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${filtroStatus === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..." className="h-8 text-sm w-48" />
          <Button onClick={() => { setForm({ ...FORM_VAZIO }); setShowModal(true) }} size="sm">
            <Plus size={14} className="mr-1" /> Nova conta
          </Button>
        </div>
      </div>

      {/* Tabela — cabeçalho congelado, mesma regra do DataTable */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 420px)', minHeight: '200px' }}>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                {['Descrição', 'Fornecedor', 'Vencimento', 'Valor', 'Status', ''].map((h, i) => (
                  <th key={i} className={`sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5 ${i === 3 ? 'text-right' : ''}`}>{h}</th>
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
                const saldo   = r.valorOriginal - r.valorPago
                return (
                  <tr key={r.contaPagarId} className="group border-b border-gray-50 hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{r.descricao}</p>
                      {r.numeroDocumento && <p className="text-xs text-gray-400">Doc: {r.numeroDocumento}</p>}
                      {r.totalParcelas > 1 && <p className="text-xs text-gray-400">{r.parcelaAtual}/{r.totalParcelas} parcelas</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.nomeFornecedor || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm ${vencida ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                        {fmtDate(r.dataVencimento)}
                      </span>
                      {vencida && <span className="block text-[10px] text-red-500">Vencida</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-sm font-bold text-gray-900">{fmt(r.valorOriginal)}</p>
                      {r.valorPago > 0 && <p className="text-xs text-gray-500">Pago: {fmt(r.valorPago)}</p>}
                      {saldo > 0 && saldo < r.valorOriginal && <p className="text-xs text-amber-600">Saldo: {fmt(saldo)}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${vencida ? 'bg-red-100 text-red-700' : (STATUS_BADGE[r.status]?.cls ?? 'bg-gray-100 text-gray-500')}`}>
                        {vencida ? 'Vencida' : (STATUS_BADGE[r.status]?.label ?? r.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                        {r.status !== 'paga' && (
                          <button onClick={() => { setShowBaixa(r); setBaixaForm({ valorPago: ((r.valorOriginal - r.valorPago) / 100).toFixed(2), dataPagamento: new Date().toISOString().slice(0, 10), formaPagamento: r.formaPagamento ?? '' }) }}
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
      </div>

      {/* Painel nova conta */}
      {showModal && (
        <SidePanel
          titulo="Nova conta a pagar"
          onClose={() => setShowModal(false)}
          largura="w-[28vw] min-w-[480px]"
          rodape={
            <>
              <Button variant="outline" onClick={() => setShowModal(false)}>Fechar</Button>
              <Button onClick={() => criarMut.mutate()} disabled={!form.descricao || !form.valorOriginal || !form.dataVencimento || criarMut.isPending}>
                {criarMut.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </>
          }
        >
          <div className="p-6 space-y-4">
            <div>
              <Label>Descrição *</Label>
              <Input value={form.descricao} onChange={e => setF('descricao', e.target.value)} className="mt-1" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fornecedor</Label>
                <Input value={form.nomeFornecedor} onChange={e => setF('nomeFornecedor', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Nº Documento</Label>
                <Input value={form.numeroDocumento} onChange={e => setF('numeroDocumento', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Categoria</Label>
                <Input value={form.categoria} onChange={e => setF('categoria', e.target.value)} className="mt-1" placeholder="Ex: Insumos, Aluguel..." />
              </div>
              <div>
                <Label>Valor total (R$) *</Label>
                <Input type="number" step="0.01" inputMode="decimal" value={form.valorOriginal}
                  onChange={e => setF('valorOriginal', e.target.value)} className="sem-spinner mt-1" placeholder="0,00" />
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
                <Input type="number" min="1" max="48" value={form.totalParcelas}
                  onChange={e => setF('totalParcelas', e.target.value)} className="sem-spinner mt-1" />
                <p className="text-xs text-gray-400 mt-1">Vencimentos a cada 30 dias</p>
              </div>
              <div>
                <Label>Forma de pagamento</Label>
                <Input value={form.formaPagamento} onChange={e => setF('formaPagamento', e.target.value)} className="mt-1" placeholder="PIX, Boleto..." />
              </div>
            </div>
            <div>
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={e => setF('observacao', e.target.value)} className="mt-1" />
            </div>
          </div>
        </SidePanel>
      )}

      {/* Painel baixa */}
      {showBaixa && (
        <SidePanel
          titulo="Baixar pagamento"
          subtitulo={showBaixa.descricao}
          onClose={() => setShowBaixa(null)}
          largura="w-[24vw] min-w-[400px]"
          rodape={
            <>
              <Button variant="outline" onClick={() => setShowBaixa(null)}>Fechar</Button>
              <Button onClick={() => baixarMut.mutate()} disabled={!baixaForm.valorPago || !baixaForm.dataPagamento || baixarMut.isPending}>
                {baixarMut.isPending ? 'Registrando...' : 'Registrar baixa'}
              </Button>
            </>
          }
        >
          <div className="p-6 space-y-4">
            <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
              <span className="text-sm text-gray-500">Saldo devedor</span>
              <span className="font-bold text-gray-900">{fmt(showBaixa.valorOriginal - showBaixa.valorPago)}</span>
            </div>
            <div>
              <Label>Valor pago (R$) *</Label>
              <Input type="number" step="0.01" inputMode="decimal" value={baixaForm.valorPago}
                onChange={e => setBF('valorPago', e.target.value)} className="sem-spinner mt-1" />
            </div>
            <div>
              <Label>Data pagamento *</Label>
              <Input type="date" value={baixaForm.dataPagamento} onChange={e => setBF('dataPagamento', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Input value={baixaForm.formaPagamento} onChange={e => setBF('formaPagamento', e.target.value)} className="mt-1" placeholder="PIX, Boleto..." />
            </div>
          </div>
        </SidePanel>
      )}

      {confirmDel && (
        <ConfirmModal title="Excluir conta" message={`Excluir "${confirmDel.descricao}"?`} confirmLabel="Excluir" danger
          onConfirm={() => { excluirMut.mutate(confirmDel.contaPagarId); setConfirmDel(null) }}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}