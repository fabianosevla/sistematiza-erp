'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calculator, ClipboardList, ListChecks, Scale, ShoppingBag, PackageCheck, ShoppingCart, Plus, X, Trash2 } from 'lucide-react'
import { Button }       from '@/components/ui/button'
import { Input }        from '@/components/ui/input'
import { Label }        from '@/components/ui/label'
import { useToast }     from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import MrpTab          from './MrpTab'
import RequisicoesTab   from './RequisicoesTab'
import ListasTab        from './ListasTab'
import CotacaoTab       from './CotacaoTab'
import PedidosTab       from './PedidosTab'
import ConferenciaTab   from './ConferenciaTab'

interface Props { tenantSlug: string }

type Aba = 'rapida' | 'mrp' | 'requisicoes' | 'listas' | 'cotacao' | 'pedidos' | 'conferencia'

const ABAS: { key: Aba; label: string; icon: any }[] = [
  { key: 'rapida',       label: 'Compra Rápida', icon: ShoppingCart },
  { key: 'mrp',          label: 'MRP',           icon: Calculator },
  { key: 'requisicoes',  label: 'Requisições',   icon: ClipboardList },
  { key: 'listas',       label: 'Listas',        icon: ListChecks },
  { key: 'cotacao',      label: 'Cotação',       icon: Scale },
  { key: 'pedidos',      label: 'Pedidos',       icon: ShoppingBag },
  { key: 'conferencia',  label: 'Conferência',   icon: PackageCheck },
]

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

export default function ComprasView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/compras`

  const [aba, setAba]                           = useState<Aba>('rapida')
  const [listaSelecionada, setListaSelecionada]   = useState<number | null>(null)
  const [pedidoSelecionado, setPedidoSelecionado] = useState<number | null>(null)

  // ── Compra Rápida ────────────────────────────────────────────────────────
  const [showModal, setShowModal]   = useState(false)
  const [confirmDel, setConfirmDel] = useState<any>(null)
  const [form, setForm] = useState({
    insumoId:       '',
    nomeInsumo:     '',
    nomeFornecedor: '',
    dataEntrada:    new Date().toISOString().slice(0, 10),
    valorUnitario:  '',
    quantidade:     '',
    observacao:     '',
  })
  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const { data: comprasRaw, isLoading } = useQuery({
    queryKey: ['compras-rapidas', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
    enabled:  aba === 'rapida',
  })

  const { data: insumosRaw } = useQuery({
    queryKey: ['insumos-compras', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/insumos?limit=500`)).json(),
    enabled:  aba === 'rapida',
  })

  const { data: fornecedoresRaw } = useQuery({
    queryKey: ['fornecedores-compras', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/fornecedores?limit=500`)).json(),
    enabled:  aba === 'rapida',
  })

  const salvarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(api, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insumoId:       form.insumoId ? Number(form.insumoId) : undefined,
          nomeInsumo:     form.nomeInsumo,
          nomeFornecedor: form.nomeFornecedor || undefined,
          dataEntrada:    form.dataEntrada,
          valorUnitario:  Math.round(parseFloat(form.valorUnitario.replace(',', '.') || '0') * 100),
          quantidade:     parseFloat(form.quantidade.replace(',', '.') || '0'),
          observacao:     form.observacao || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao registrar compra')
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras-rapidas', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['estoque-insumos', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['fin-despesas', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['fin-kpis', tenantSlug] })
      setShowModal(false)
      setForm({ insumoId: '', nomeInsumo: '', nomeFornecedor: '', dataEntrada: new Date().toISOString().slice(0, 10), valorUnitario: '', quantidade: '', observacao: '' })
      toast('Compra registrada! Estoque e despesa atualizados.')
    },
    onError: (e: any) => toast(e.message || 'Erro ao registrar.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao excluir')
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras-rapidas', tenantSlug] })
      toast('Compra excluída.')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  // Dados derivados
  const compras     = Array.isArray(comprasRaw?.data) ? comprasRaw.data : []
  const insumos     = Array.isArray(insumosRaw?.data?.data) ? insumosRaw.data.data
    : Array.isArray(insumosRaw?.data) ? insumosRaw.data : []
  const fornecedores = Array.isArray(fornecedoresRaw?.data?.data) ? fornecedoresRaw.data.data
    : Array.isArray(fornecedoresRaw?.data) ? fornecedoresRaw.data : []

  function irParaCotacao(listaId: number) { setListaSelecionada(listaId); setAba('cotacao') }
  function irParaConferencia(pedidoId: number) { setPedidoSelecionado(pedidoId); setAba('conferencia') }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Compras</h1>
        <p className="text-sm text-gray-400 mt-0.5">Compra rápida ou fluxo completo: Requisição → MRP → Lista → Cotação → Pedido → Conferência</p>
      </div>

      <div className="border-b border-gray-100 mb-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {ABAS.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a.key ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <a.icon size={14} />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ABA: COMPRA RÁPIDA */}
      {aba === 'rapida' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-700">
              <strong>Compra Rápida</strong> — para compras diretas no mercado ou com fornecedor.
              Ao registrar, o estoque do insumo é atualizado automaticamente e uma despesa é lançada no financeiro.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{compras.length} compra(s) registrada(s)</p>
            <Button size="sm" onClick={() => setShowModal(true)}>
              <Plus size={13} className="mr-1" /> Registrar Compra
            </Button>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Data', 'Insumo', 'Fornecedor', 'Qtd', 'Valor Unit.', 'Total', ''].map((h, i) => (
                    <th key={i} className={`text-left text-xs font-medium text-gray-400 px-4 py-3 ${i >= 3 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-sm text-gray-400">Carregando...</td></tr>
                ) : compras.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-sm text-gray-400">Nenhuma compra registrada.</td></tr>
                ) : compras.map((c: any) => {
                  const qtd  = parseFloat(c.qtdTotal ?? c.quantidade ?? '0')
                  const unit = c.valorUnitario ?? 0
                  const tot  = Math.round(unit * qtd)
                  return (
                    <tr key={c.compraId} className="group border-b border-gray-50 hover:bg-gray-50/80">
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {c.dataEntrada ? new Date(c.dataEntrada + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.nomeInsumo}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{c.nomeFornecedor || '—'}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">{qtd.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-700">{fmt(unit)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">{fmt(tot)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setConfirmDel(c)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-opacity">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {compras.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-gray-600">Total</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-red-600">
                      {fmt(compras.reduce((a: number, c: any) => {
                        const qtd = parseFloat(c.qtdTotal ?? c.quantidade ?? '0')
                        return a + Math.round((c.valorUnitario ?? 0) * qtd)
                      }, 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {aba === 'mrp'         && <MrpTab tenantSlug={tenantSlug} onListaGerada={irParaCotacao} />}
      {aba === 'requisicoes' && <RequisicoesTab tenantSlug={tenantSlug} />}
      {aba === 'listas'      && <ListasTab tenantSlug={tenantSlug} onIniciarCotacao={irParaCotacao} />}
      {aba === 'cotacao'     && <CotacaoTab tenantSlug={tenantSlug} listaIdInicial={listaSelecionada} onPedidosGerados={() => setAba('pedidos')} />}
      {aba === 'pedidos'     && <PedidosTab tenantSlug={tenantSlug} onIniciarConferencia={irParaConferencia} />}
      {aba === 'conferencia' && <ConferenciaTab tenantSlug={tenantSlug} pedidoIdInicial={pedidoSelecionado} />}

      {/* Modal Registrar Compra */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold">Registrar Compra</h2>
                <p className="text-xs text-gray-400 mt-0.5">Estoque e despesa serão atualizados automaticamente</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <Label>Insumo *</Label>
                <select value={form.insumoId} onChange={e => {
                  const ins = insumos.find((i: any) => String(i.insumoId) === e.target.value)
                  setF('insumoId', e.target.value)
                  if (ins) setF('nomeInsumo', ins.nome)
                  else setF('nomeInsumo', '')
                }} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  <option value="">Selecionar insumo cadastrado...</option>
                  {insumos.map((i: any) => (
                    <option key={i.insumoId} value={i.insumoId}>{i.nome} ({i.unidade})</option>
                  ))}
                </select>
                {!form.insumoId && (
                  <div className="mt-2">
                    <Input value={form.nomeInsumo} onChange={e => setF('nomeInsumo', e.target.value)}
                      placeholder="Ou digite o nome do item..." className="h-8 text-sm" />
                    <p className="text-xs text-gray-400 mt-1">Se não cadastrado, só registra a compra sem atualizar estoque.</p>
                  </div>
                )}
              </div>

              <div>
                <Label>Fornecedor</Label>
                <select value={form.nomeFornecedor} onChange={e => setF('nomeFornecedor', e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  <option value="">Selecionar ou digitar...</option>
                  {fornecedores.map((f: any) => (
                    <option key={f.fornecedorId} value={f.nomeFantasia ?? f.razaoSocial}>{f.nomeFantasia ?? f.razaoSocial}</option>
                  ))}
                </select>
                {!form.nomeFornecedor && (
                  <Input value={form.nomeFornecedor} onChange={e => setF('nomeFornecedor', e.target.value)}
                    placeholder="Nome do fornecedor (opcional)" className="mt-2 h-8 text-sm" />
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Data *</Label>
                  <Input type="date" value={form.dataEntrada} onChange={e => setF('dataEntrada', e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label>Quantidade *</Label>
                  <Input type="number" min="0" step="0.001" value={form.quantidade}
                    onChange={e => setF('quantidade', e.target.value)} className="mt-1 h-9 text-sm" placeholder="0" />
                </div>
                <div>
                  <Label>Valor unitário (R$) *</Label>
                  <Input type="number" min="0" step="0.01" value={form.valorUnitario}
                    onChange={e => setF('valorUnitario', e.target.value)} className="mt-1 h-9 text-sm" placeholder="0,00" />
                </div>
              </div>

              {form.quantidade && form.valorUnitario && (
                <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
                  <span className="text-sm text-gray-500">Total da compra</span>
                  <span className="text-base font-bold text-red-600">
                    {fmt(Math.round(parseFloat(form.valorUnitario.replace(',', '.') || '0') * 100 * parseFloat(form.quantidade.replace(',', '.') || '0')))}
                  </span>
                </div>
              )}

              <div>
                <Label>Observação</Label>
                <Input value={form.observacao} onChange={e => setF('observacao', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Opcional" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button onClick={() => salvarMut.mutate()}
                disabled={(!form.insumoId && !form.nomeInsumo) || !form.quantidade || !form.valorUnitario || salvarMut.isPending}>
                {salvarMut.isPending ? 'Registrando...' : 'Registrar Compra'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <ConfirmModal title="Excluir compra"
          message={`Excluir a compra de "${confirmDel.nomeInsumo}"? O estoque e a despesa não serão revertidos automaticamente.`}
          confirmLabel="Excluir" danger
          onConfirm={() => { excluirMut.mutate(confirmDel.compraId); setConfirmDel(null) }}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}