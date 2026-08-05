'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ShoppingCart, Package, Layers } from 'lucide-react'
import { Button }       from '@/components/ui/button'
import { Input }        from '@/components/ui/input'
import { Label }        from '@/components/ui/label'
import { useToast }     from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { InfoTip }      from '@/components/ui/InfoTip'
import { Aviso }        from '@/components/ui/Aviso'
import { PageHeader }   from '@/components/ui/PageHeader'
import { FormModal }    from '@/components/ui/FormModal'
import { BotaoIcone }   from '@/components/ui/BotaoIcone'
import { fmtMoeda as fmt, fmtData } from '@/lib/format'

interface Props { tenantSlug: string }

type TipoItem = 'insumo' | 'produto'

export default function CompraRapidaView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/compras`

  const [showModal, setShowModal]   = useState(false)
  const [confirmDel, setConfirmDel] = useState<any>(null)
  const [tipoItem, setTipoItem]     = useState<TipoItem>('insumo')
  const [form, setForm] = useState({
    insumoId:       '',
    produtoId:      '',
    nomeItem:       '',
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
  })

  const { data: insumosRaw } = useQuery({
    queryKey: ['insumos-compras', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/insumos?limit=500`)).json(),
  })

  const { data: produtosRaw } = useQuery({
    queryKey: ['produtos-compras', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos?limit=500`)).json(),
  })

  const { data: fornecedoresRaw } = useQuery({
    queryKey: ['fornecedores-compras', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/fornecedores?limit=500`)).json(),
  })

  const salvarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(api, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insumoId:       tipoItem === 'insumo' && form.insumoId ? Number(form.insumoId) : undefined,
          produtoId:      tipoItem === 'produto' && form.produtoId ? Number(form.produtoId) : undefined,
          nomeInsumo:     form.nomeItem,
          tipItem:        tipoItem,
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
      qc.invalidateQueries({ queryKey: ['estoque-produtos', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['fin-despesas', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['fin-kpis', tenantSlug] })
      setShowModal(false)
      resetForm()
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compras-rapidas', tenantSlug] }); toast('Compra excluída.') },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  function resetForm() {
    setForm({ insumoId: '', produtoId: '', nomeItem: '', nomeFornecedor: '', dataEntrada: new Date().toISOString().slice(0, 10), valorUnitario: '', quantidade: '', observacao: '' })
    setTipoItem('insumo')
  }

  const compras      = Array.isArray(comprasRaw?.data) ? comprasRaw.data : []
  const insumos      = Array.isArray(insumosRaw?.data?.data) ? insumosRaw.data.data : Array.isArray(insumosRaw?.data) ? insumosRaw.data : []
  const todosProdutos = Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data : Array.isArray(produtosRaw?.data) ? produtosRaw.data : []
  // Mostra na combobox apenas produtos marcados como revenda
  const produtosRevenda = todosProdutos.filter((p: any) => p.tipo === 'Revenda' || p.revenda === true)
  const fornecedores  = Array.isArray(fornecedoresRaw?.data?.data) ? fornecedoresRaw.data.data : Array.isArray(fornecedoresRaw?.data) ? fornecedoresRaw.data : []

  const totalGasto = compras.reduce((a: number, c: any) => {
    const qtd = parseFloat(c.qtdTotal ?? c.quantidade ?? '0')
    return a + Math.round((c.valorUnitario ?? 0) * qtd)
  }, 0)

  return (
    <div>
      <PageHeader
        titulo="Compra Rápida"
        acoes={
          <>
            <InfoTip titulo="O que acontece ao registrar">
              Compra de <strong>insumo</strong> aumenta o estoque do insumo.
              Compra de <strong>produto para revenda</strong> aumenta o estoque do produto.
              Nos dois casos, uma despesa é lançada automaticamente no financeiro.
            </InfoTip>
            <Button onClick={() => { resetForm(); setShowModal(true) }}>
              <Plus size={15} className="mr-1.5" /> Registrar Compra
            </Button>
          </>
        }
      />

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400">Total de compras</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{compras.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-xs text-gray-400">Total gasto</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{fmt(totalGasto)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {['Data', 'Item', 'Tipo', 'Fornecedor', 'Qtd', 'Valor Unit.', 'Total', ''].map((h, i) => (
                <th key={i} className={`text-left text-xs font-medium text-gray-400 px-4 py-3 ${i >= 4 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-sm text-gray-400">Carregando...</td></tr>
            ) : compras.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-sm text-gray-400">
                <ShoppingCart size={28} className="text-gray-200 mx-auto mb-2" />
                Nenhuma compra registrada ainda.
              </td></tr>
            ) : compras.map((c: any) => {
              const qtd  = parseFloat(c.qtdTotal ?? c.quantidade ?? '0')
              const unit = c.valorUnitario ?? 0
              const tot  = Math.round(unit * qtd)
              return (
                <tr key={c.compraId} className="group border-b border-gray-50 hover:bg-gray-50/80">
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtData(c.dataEntrada)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.nomeInsumo}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {c.tipoItem === 'produto' ? (
                      <span className="flex items-center gap-1 text-gray-600"><Package size={12} /> Revenda</span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-500"><Layers size={12} /> Insumo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{c.nomeFornecedor || '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">{qtd.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">{fmt(unit)}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">{fmt(tot)}</td>
                  <td className="px-4 py-3">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <BotaoIcone titulo="Excluir compra" variante="perigo" onClick={() => setConfirmDel(c)}>
                        <Trash2 size={13} />
                      </BotaoIcone>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {compras.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-100 bg-gray-50">
                <td colSpan={6} className="px-4 py-2.5 text-xs font-semibold text-gray-600">Total</td>
                <td className="px-4 py-2.5 text-right text-sm font-bold text-red-600">{fmt(totalGasto)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <FormModal titulo="Registrar Compra" onClose={() => setShowModal(false)} largura="max-w-lg">
          <div className="p-6 space-y-4">

            {/* Tipo do item */}
            <div>
              <Label>Tipo de item *</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {[
                  { key: 'insumo',  label: 'Insumo de produção', icon: Layers },
                  { key: 'produto', label: 'Produto para revenda', icon: Package },
                ].map(t => (
                  <button key={t.key} onClick={() => { setTipoItem(t.key as TipoItem); setF('insumoId', ''); setF('produtoId', ''); setF('nomeItem', '') }}
                    className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors ${
                      tipoItem === t.key ? 'bg-green-50 border-green-400 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}>
                    <t.icon size={14} /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Seleção do item */}
            <div>
              <Label>{tipoItem === 'insumo' ? 'Insumo' : 'Produto para Revenda'} *</Label>
              {tipoItem === 'insumo' ? (
                <>
                  <select value={form.insumoId} onChange={e => {
                    const ins = insumos.find((i: any) => String(i.insumoId) === e.target.value)
                    setF('insumoId', e.target.value)
                    if (ins) setF('nomeItem', ins.nome)
                  }} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    <option value="">Selecionar insumo cadastrado...</option>
                    {insumos.map((i: any) => <option key={i.insumoId} value={i.insumoId}>{i.nome} ({i.unidade})</option>)}
                  </select>
                  {!form.insumoId && (
                    <Input value={form.nomeItem} onChange={e => setF('nomeItem', e.target.value)}
                      placeholder="Ou digite o nome do insumo..." className="mt-2 h-8 text-sm" />
                  )}
                </>
              ) : (
                <>
                  <select value={form.produtoId} onChange={e => {
                    const p = produtosRevenda.find((x: any) => String(x.produtoId) === e.target.value)
                    setF('produtoId', e.target.value)
                    if (p) setF('nomeItem', p.nome)
                  }} className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    <option value="">Selecionar produto para revenda...</option>
                    {produtosRevenda.map((p: any) => <option key={p.produtoId} value={p.produtoId}>{p.nome}</option>)}
                  </select>
                  {/* Condição real do sistema — nenhum produto configurado como revenda */}
                  {produtosRevenda.length === 0 && (
                    <Aviso tom="atencao" className="mt-2">
                      Nenhum produto marcado como Revenda. Configure em Cadastros → Produtos.
                    </Aviso>
                  )}
                  {!form.produtoId && (
                    <Input value={form.nomeItem} onChange={e => setF('nomeItem', e.target.value)}
                      placeholder="Ou digite o nome do produto..." className="mt-2 h-8 text-sm" />
                  )}
                </>
              )}
            </div>

            {/* Fornecedor */}
            <div>
              <Label>Fornecedor</Label>
              <select value={form.nomeFornecedor} onChange={e => setF('nomeFornecedor', e.target.value)}
                className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                <option value="">Selecionar...</option>
                {fornecedores.map((f: any) => (
                  <option key={f.fornecedorId} value={f.nomeFantasia ?? f.razaoSocial}>{f.nomeFantasia ?? f.razaoSocial}</option>
                ))}
              </select>
            </div>

            {/* Data, Qtd, Valor */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Data *</Label>
                <Input type="date" value={form.dataEntrada} onChange={e => setF('dataEntrada', e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <Label>Quantidade *</Label>
                <Input type="number" min="0" step="1" value={form.quantidade}
                  onChange={e => setF('quantidade', e.target.value)} className="mt-1 h-9 text-sm" placeholder="0" />
              </div>
              <div>
                <Label>Valor unitário (R$) *</Label>
                <Input type="number" min="0" step="0.01" value={form.valorUnitario}
                  onChange={e => setF('valorUnitario', e.target.value)} className="mt-1 h-9 text-sm" placeholder="0,00" />
              </div>
            </div>

            {/* Total calculado */}
            {form.quantidade && form.valorUnitario && (
              <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm text-gray-500">Total da compra</span>
                <span className="text-base font-bold text-red-600">
                  {fmt(Math.round(
                    parseFloat(form.valorUnitario.replace(',', '.') || '0') * 100 *
                    parseFloat(form.quantidade.replace(',', '.') || '0')
                  ))}
                </span>
              </div>
            )}

            <div>
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={e => setF('observacao', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Opcional" />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button onClick={() => salvarMut.mutate()}
                disabled={!form.nomeItem || !form.quantidade || !form.valorUnitario || salvarMut.isPending}>
                {salvarMut.isPending ? 'Registrando...' : 'Registrar Compra'}
              </Button>
            </div>
          </div>
        </FormModal>
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