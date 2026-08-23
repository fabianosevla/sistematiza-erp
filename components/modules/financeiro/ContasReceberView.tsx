'use client'
// components/modules/financeiro/ContasReceberView.tsx
// Espelho de ContasPagarView mas para recebimentos

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, CheckCircle, Pencil } from 'lucide-react'
import { FormModal } from '@/components/ui/FormModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { InfoTip } from '@/components/ui/InfoTip'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { fmtMoeda as fmt, fmtData as fmtDate, toInputDate } from '@/lib/format'

interface Props { tenantSlug: string }

function isVencida(row: any) {
  return row.status === 'aberta' && row.dataVencimento < new Date().toISOString().slice(0, 10)
}

const FORM_VAZIO = {
  descricao: '', nomeCliente: '', categoria: '', numeroDocumento: '',
  valorBase: '', desconto: '0', acrescimo: '',
  valorOriginal: '', dataEmissao: new Date().toISOString().slice(0, 10),
  dataVencimento: '', formaRecebimento: '', observacao: '', totalParcelas: '1',
}

const brl = (n: number) =>
  (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Reais digitados com vírgula ou ponto. Campo vazio é zero, não NaN. */
const num = (v: string) => parseFloat(String(v ?? '').replace(',', '.')) || 0

export default function ContasReceberView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/contas-receber`

  const [filtroStatus, setFiltroStatus] = useState('todas')
  const [busca, setBusca]               = useState('')
  const [page, setPage]                 = useState(1)
  const [limit, setLimit]               = useState(20)
  const [sortKey, setSortKey]           = useState('dataEntrega')
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc')
  const [showModal, setShowModal]       = useState(false)
  // Conta em edição. Null = o modal está criando.
  const [editando, setEditando]         = useState<any | null>(null)
  const [showBaixa, setShowBaixa]       = useState<any | null>(null)
  const [confirmDel, setConfirmDel]     = useState<any | null>(null)

  const [form, setForm] = useState({ ...FORM_VAZIO })
  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const [baixaForm, setBaixaForm] = useState({
    valorRecebido: '', dataRecebimento: new Date().toISOString().slice(0, 10), formaRecebimento: '',
  })
  const setBF = (k: string, v: string) => setBaixaForm(p => ({ ...p, [k]: v }))

  // Formas cadastradas em Cadastros → Formas de Pagamento. Combobox em vez de
  // texto livre para que a consulta de vendas consiga filtrar por elas depois —
  // "PIX", "pix" e "Pix" digitados à mão viram três formas diferentes.
  const { data: formasRaw } = useQuery({
    queryKey: ['formas-pagamento', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/formas-pagamento`)).json(),
    staleTime: 5 * 60 * 1000,
  })
  const formasNomes: string[] = (formasRaw?.data ?? [])
    .map((f: any) => f.nome)
    .filter(Boolean)

  // Conta vinda de pedido tem o valor amarrado à soma dos itens. Ajuste se faz
  // por desconto ou acréscimo, não reescrevendo o valor da mercadoria.
  const vindoDePedido = editando?.origem === 'pedido'

  const totalCalculado = Math.max(0, num(form.valorBase) - num(form.desconto) + num(form.acrescimo))

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['contas-receber', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['contas-receber-kpis', tenantSlug] })
    // A notificação de vencidas é recalculada a partir destes títulos.
    qc.invalidateQueries({ queryKey: ['notificacoes', tenantSlug] })
  }

  const { data: kpisRaw } = useQuery({
    queryKey: ['contas-receber-kpis', tenantSlug],
    queryFn:  async () => (await fetch(`${api}?tipo=kpis`)).json(),
    refetchInterval: 30000,
  })

  const { data: listRaw, isLoading } = useQuery({
    queryKey: ['contas-receber', tenantSlug, filtroStatus, busca, page, limit, sortKey, sortDir],
    queryFn:  async () => {
      const p = new URLSearchParams({
        status: filtroStatus, page: String(page), limit: String(limit),
        sort: sortKey, dir: sortDir,
      })
      if (busca) p.set('busca', busca)
      return (await fetch(`${api}?${p}`)).json()
    },
  })

  function toggleSort(chave: string) {
    if (sortKey === chave) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(chave); setSortDir('desc') }
    setPage(1)
  }

  function abrirNova() {
    setEditando(null)
    setForm({ ...FORM_VAZIO })
    setShowModal(true)
  }

  // Editar traz a conta para o mesmo modal. O caso mais comum é só mudar o
  // vencimento — um pedido entregue nasce vencendo na previsão de entrega, e
  // o combinado com o cliente às vezes é outro.
  function abrirEdicao(r: any) {
    setEditando(r)
    setForm({
      descricao:        r.descricao ?? '',
      nomeCliente:      r.nomeCliente ?? '',
      categoria:        r.categoria ?? '',
      numeroDocumento:  r.numeroDocumento ?? '',
      // Conta antiga não tem valor_base: o próprio total serve de base.
      valorBase:        (((r.valorBase ?? r.valorOriginal ?? 0)) / 100).toFixed(2),
      desconto:         ((r.desconto ?? 0) / 100).toFixed(2),
      acrescimo:        ((r.acrescimo ?? 0) / 100).toFixed(2),
      valorOriginal:    ((r.valorOriginal ?? 0) / 100).toFixed(2),
      dataEmissao:      toInputDate(r.dataEmissao),
      dataVencimento:   toInputDate(r.dataVencimento),
      formaRecebimento: r.formaRecebimento ?? '',
      observacao:       r.observacao ?? '',
      totalParcelas:    String(r.totalParcelas ?? 1),
    })
    setShowModal(true)
  }

  function fecharModal() {
    setShowModal(false)
    setEditando(null)
    setForm({ ...FORM_VAZIO })
  }

  const criarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          valorBase:     num(form.valorBase),
          desconto:      num(form.desconto),
          acrescimo:     num(form.acrescimo),
          valorOriginal: totalCalculado,
          totalParcelas: parseInt(form.totalParcelas) || 1,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => { inv(); fecharModal(); toast('Conta a receber criada!') },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  // Só os campos editáveis vão no PUT. Mandar o objeto inteiro levaria junto
  // o id e os campos de auditoria, que a rota gravaria por cima.
  const editarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${api}/${editando.contaReceberId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao:        form.descricao,
          nomeCliente:      form.nomeCliente || null,
          categoria:        form.categoria || null,
          numeroDocumento:  form.numeroDocumento || null,
          // O total não vai: a rota o calcula a partir da base e dos ajustes.
          valorBase:        num(form.valorBase),
          desconto:         num(form.desconto),
          acrescimo:        num(form.acrescimo),
          dataEmissao:      form.dataEmissao,
          dataVencimento:   form.dataVencimento,
          formaRecebimento: form.formaRecebimento || null,
          observacao:       form.observacao || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: () => { inv(); fecharModal(); toast('Conta atualizada!') },
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
    onSuccess: (d: any) => {
      inv()
      // Quitar conta de pedido cria a venda. Estoque não muda — ele já saiu na
      // entrega —, mas vendas, consultas e dashboard passam a contar o valor.
      for (const chave of ['vendas', 'vendas-kpis', 'consultas', 'dashboard', 'pedidos']) {
        qc.invalidateQueries({ queryKey: [chave] })
      }
      setShowBaixa(null)
      setBaixaForm({ valorRecebido: '', dataRecebimento: new Date().toISOString().slice(0, 10), formaRecebimento: '' })
      const vendaId = d?.data?.vendaId
      toast(vendaId ? `Recebimento registrado. Venda #${vendaId} gerada.` : 'Recebimento registrado.')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess:  () => { inv(); toast('Excluído.') },
  })

  const kpis = kpisRaw?.data
  const rows = Array.isArray(listRaw?.data?.data) ? listRaw.data.data : Array.isArray(listRaw?.data) ? listRaw.data : []
  const meta = listRaw?.data?.meta ?? null

  const salvando = criarMut.isPending || editarMut.isPending

  const colunas: Coluna[] = [
    {
      chave: 'descricao', titulo: 'Descrição', principal: true, ordenavel: true,
      render: (r: any) => (
        <>
          <p className="text-sm font-medium text-gray-900">{r.descricao}</p>
          {r.numeroDocumento && <p className="text-xs text-gray-400">Doc: {r.numeroDocumento}</p>}
          {r.totalParcelas > 1 && <p className="text-xs text-gray-400">{r.parcelaAtual}/{r.totalParcelas} parcelas</p>}
        </>
      ),
    },
    {
      chave: 'nomeCliente', titulo: 'Cliente', ordenavel: true,
      render: (r: any) => r.nomeCliente || '—',
    },
    {
      chave: 'dataEntrega', titulo: 'Entregue', ordenavel: true,
      render: (r: any) => r.dataEntrega ? fmtDate(r.dataEntrega) : '—',
    },
    {
      chave: 'dataVencimento', titulo: 'Vencimento', ordenavel: true,
      render: (r: any) => {
        const vencida = isVencida(r)
        return (
          <>
            <span className={`text-sm ${vencida ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{fmtDate(r.dataVencimento)}</span>
            {vencida && <span className="block text-[10px] text-red-500">Vencida</span>}
          </>
        )
      },
    },
    {
      chave: 'valorOriginal', titulo: 'Valor', ordenavel: true, alinhamento: 'right',
      render: (r: any) => {
        const saldo = r.valorOriginal - r.valorRecebido
        return (
          <>
            <p className="text-sm font-bold text-gray-900">{fmt(r.valorOriginal)}</p>
            {r.valorRecebido > 0 && <p className="text-xs text-green-600">Recebido: {fmt(r.valorRecebido)}</p>}
            {saldo > 0 && saldo < r.valorOriginal && <p className="text-xs text-gray-500">Saldo: {fmt(saldo)}</p>}
          </>
        )
      },
    },
    {
      chave: 'status', titulo: 'Status', ordenavel: true,
      render: (r: any) => {
        const vencida = isVencida(r)
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            vencida ? 'bg-red-100 text-red-700' :
            r.status === 'recebida' ? 'bg-green-100 text-green-700' :
            r.status === 'aberta'   ? 'bg-gray-100 text-gray-700'  :
            'bg-gray-100 text-gray-500'
          }`}>
            {vencida ? 'Vencida' : r.status === 'recebida' ? 'Recebida' : r.status === 'aberta' ? 'Aberta' : r.status}
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-5">
      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { label: 'A receber',   value: fmt(kpis.aReceber),      sub: `${kpis.qtdAberta} título(s)`,   color: 'text-gray-600' },
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
            <button key={s} onClick={() => { setFiltroStatus(s); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${filtroStatus === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input value={busca} onChange={e => { setBusca(e.target.value); setPage(1) }} placeholder="Buscar..." className="h-8 text-sm w-48" />
          <Button onClick={abrirNova} size="sm">
            <Plus size={14} className="mr-1" /> Nova conta
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <DataTable
        colunas={colunas}
        itens={rows}
        chave={(r: any) => r.contaReceberId}
        carregando={isLoading}
        usarSkeleton
        vazio="Nenhum título encontrado."
        ordem={{ chave: sortKey, dir: sortDir }}
        onOrdenar={toggleSort}
        meta={meta}
        onPageChange={setPage}
        onLimitChange={(l: number) => { setLimit(l); setPage(1) }}
        acoes={(r: any) => (
          <>
            {r.status !== 'recebida' && (
              <>
                <button onClick={() => abrirEdicao(r)}
                  className="p-1 text-gray-400 hover:text-gray-600" title="Editar (vencimento, valor, dados)">
                  <Pencil size={13} />
                </button>
                <button onClick={() => { setShowBaixa(r); setBaixaForm({ valorRecebido: ((r.valorOriginal - r.valorRecebido) / 100).toFixed(2), dataRecebimento: new Date().toISOString().slice(0, 10), formaRecebimento: r.formaRecebimento ?? '' }) }}
                  className="p-1 text-green-500 hover:text-green-700" title="Baixar">
                  <CheckCircle size={14} />
                </button>
              </>
            )}
            <button onClick={() => setConfirmDel(r)} className="p-1 text-gray-300 hover:text-red-500">
              <Trash2 size={13} />
            </button>
          </>
        )}
      />

      {/* Modal nova conta / edição */}
      {showModal && (
        <FormModal
          titulo={editando ? 'Editar conta a receber' : 'Nova conta a receber'}
          subtitulo={editando?.origem === 'pedido' ? 'Gerada pela entrega de um pedido' : undefined}
          onClose={fecharModal}
          largura="max-w-lg"
        >
            <div className="p-6 space-y-4">
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
                  <Label className="flex items-center gap-1">
                    Valor (R$) *
                    <InfoTip titulo="Valor">Vindo de pedido, é a soma dos itens e não se edita.</InfoTip>
                  </Label>
                  <Input type="number" step="0.01" inputMode="decimal" value={form.valorBase}
                    onChange={e => setF('valorBase', e.target.value)}
                    disabled={vindoDePedido}
                    className="sem-spinner mt-1" placeholder="0,00" />
                </div>
                <div>
                  <Label>Desconto (R$)</Label>
                  <Input type="number" step="0.01" inputMode="decimal" value={form.desconto}
                    onChange={e => setF('desconto', e.target.value)} className="sem-spinner mt-1" placeholder="0,00" />
                </div>
                <div>
                  <Label>Acréscimo (R$)</Label>
                  <Input type="number" step="0.01" inputMode="decimal" value={form.acrescimo}
                    onChange={e => setF('acrescimo', e.target.value)} className="sem-spinner mt-1" placeholder="0,00" />
                </div>
                <div>
                  <Label>Data emissão *</Label>
                  <Input type="date" value={form.dataEmissao} onChange={e => setF('dataEmissao', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Vencimento *</Label>
                  <Input type="date" value={form.dataVencimento} onChange={e => setF('dataVencimento', e.target.value)} className="mt-1" />
                </div>
                {/* Parcelamento só faz sentido ao criar: a conta existente já
                    nasceu com o número de parcelas dela. */}
                {!editando && (
                  <div>
                    <Label>Parcelas</Label>
                    <Input type="number" min="1" max="48" value={form.totalParcelas}
                      onChange={e => setF('totalParcelas', e.target.value)} className="sem-spinner mt-1" />
                  </div>
                )}
                <div>
                  <Label>Forma de recebimento</Label>
                  <select
                    value={form.formaRecebimento}
                    onChange={e => setF('formaRecebimento', e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white"
                  >
                    <option value="">—</option>
                    {formasNomes.map((f: string) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              {/* O total é calculado, não digitado: base menos desconto mais
                  acréscimo. Digitar o total direto permitia mudar a cobrança
                  sem deixar registro do motivo. */}
              <div className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
                <span className="text-sm text-gray-500">Total a receber</span>
                <span className="text-base font-semibold text-gray-900">{brl(totalCalculado)}</span>
              </div>

              <div>
                <Label>Observação</Label>
                <Input value={form.observacao} onChange={e => setF('observacao', e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 flex-shrink-0">
              <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
              <Button
                onClick={() => (editando ? editarMut.mutate() : criarMut.mutate())}
                disabled={!form.descricao || !form.valorBase || !form.dataVencimento || salvando}>
                {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar conta'}
              </Button>
            </div>
        </FormModal>
      )}

      {/* Painel de baixa */}
      {showBaixa && (
        <FormModal
          titulo="Registrar recebimento"
          subtitulo={showBaixa.descricao}
          onClose={() => setShowBaixa(null)}
          largura="max-w-sm"
        >
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                <span className="text-sm text-gray-500">Saldo a receber</span>
                <span className="font-bold text-gray-600">{fmt(showBaixa.valorOriginal - showBaixa.valorRecebido)}</span>
              </div>
              <div>
                <Label>Valor recebido (R$) *</Label>
                <Input type="number" step="0.01" inputMode="decimal" value={baixaForm.valorRecebido}
                  onChange={e => setBF('valorRecebido', e.target.value)} className="sem-spinner mt-1" />
              </div>
              <div>
                <Label>Data recebimento *</Label>
                <Input type="date" value={baixaForm.dataRecebimento} onChange={e => setBF('dataRecebimento', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  Forma de recebimento
                  <InfoTip titulo="Forma de recebimento">Vai para a venda gerada na quitação e permite filtrar por ela em Consultas.</InfoTip>
                </Label>
                <select
                  value={baixaForm.formaRecebimento}
                  onChange={e => setBF('formaRecebimento', e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white"
                >
                  <option value="">—</option>
                  {formasNomes.map((f: string) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowBaixa(null)}>Cancelar</Button>
                <Button onClick={() => baixarMut.mutate()} disabled={!baixaForm.valorRecebido || baixarMut.isPending}>
                  {baixarMut.isPending ? 'Registrando...' : 'Confirmar recebimento'}
                </Button>
              </div>
            </div>
        </FormModal>
      )}

      {confirmDel && (
        <ConfirmModal title="Excluir conta" message={`Excluir "${confirmDel.descricao}"?`} confirmLabel="Excluir" danger
          onConfirm={() => { excluirMut.mutate(confirmDel.contaReceberId); setConfirmDel(null) }}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}