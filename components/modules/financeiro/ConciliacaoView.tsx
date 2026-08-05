'use client'
// components/modules/financeiro/ConciliacaoView.tsx

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Upload, CheckCircle, EyeOff, Building2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SidePanel } from '@/components/ui/SidePanel'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt, fmtData as fmtDate } from '@/lib/format'

interface Props { tenantSlug: string }

export default function ConciliacaoView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/conciliacao`
  const fileRef   = useRef<HTMLInputElement>(null)

  const [contaSelecionada, setContaSelecionada] = useState<number | null>(null)
  const [filtroStatus, setFiltroStatus]         = useState('pendente')
  const [showNovaConta, setShowNovaConta]       = useState(false)
  const [importando, setImportando]             = useState(false)

  const [novaConta, setNovaConta] = useState({ nome: '', banco: '', agencia: '', conta: '', tipo: 'corrente', saldoInicial: '' })
  const setNC = (k: string, v: string) => setNovaConta(p => ({ ...p, [k]: v }))

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['conciliacao-extrato', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['conciliacao-kpis',   tenantSlug] })
  }

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: contasRaw } = useQuery({
    queryKey: ['conciliacao-contas', tenantSlug],
    queryFn:  async () => (await fetch(`${api}?tipo=contas`)).json(),
  })

  const { data: kpisRaw } = useQuery({
    queryKey: ['conciliacao-kpis', tenantSlug, contaSelecionada],
    queryFn:  async () => (await fetch(`${api}?tipo=kpis&contaId=${contaSelecionada}`)).json(),
    enabled:  !!contaSelecionada,
  })

  const { data: extratoRaw, isLoading: loadingExtrato } = useQuery({
    queryKey: ['conciliacao-extrato', tenantSlug, contaSelecionada, filtroStatus],
    queryFn:  async () => {
      const p = new URLSearchParams({ tipo: 'extrato', contaId: String(contaSelecionada), status: filtroStatus })
      return (await fetch(`${api}?${p}`)).json()
    },
    enabled: !!contaSelecionada,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────
  // Usa "acao" (não "tipo") para discriminar a operação POST, evitando
  // conflito com novaConta.tipo (corrente/poupança/investimento).
  const criarContaMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'criar-conta',
          ...novaConta,
          saldoInicial: Math.round(parseFloat(novaConta.saldoInicial || '0') * 100),
        }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['conciliacao-contas', tenantSlug] })
      setContaSelecionada(data.data.contaBancariaId)
      // Este painel FECHA ao salvar, e é exceção proposital: criar a conta
      // bancária é o passo anterior a importar o OFX, e o painel aberto
      // ficaria por cima do extrato que a pessoa acabou de habilitar.
      setShowNovaConta(false)
      setNovaConta({ nome: '', banco: '', agencia: '', conta: '', tipo: 'corrente', saldoInicial: '' })
      toast('Conta criada! Agora importe o extrato OFX.')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  const conciliarMut = useMutation({
    mutationFn: async ({ extratoId, acao }: { extratoId: number; acao: 'ignorar' | 'outro' }) => {
      const res = await fetch(`${api}/${extratoId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: acao === 'ignorar' ? 'ignorar' : 'conciliar', tipo: 'outro' }),
      })
      return res.json()
    },
    onSuccess: () => { inv(); toast('Lançamento atualizado.') },
  })

  // ── Import OFX ────────────────────────────────────────────────────────────
  async function handleOFX(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !contaSelecionada) return
    setImportando(true)
    try {
      const conteudo = await file.text()
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'importar-ofx', contaBancariaId: contaSelecionada, conteudoOFX: conteudo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message)
      inv()
      toast(`${data.data.importados} lançamento(s) importado(s). ${data.data.duplicados} duplicado(s) ignorado(s).`)
    } catch (err: any) {
      toast(err.message || 'Erro ao importar OFX.', 'error')
    } finally {
      setImportando(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const contas  = Array.isArray(contasRaw?.data) ? contasRaw.data : []
  const kpis    = kpisRaw?.data
  const extrato = Array.isArray(extratoRaw?.data?.data) ? extratoRaw.data.data
    : Array.isArray(extratoRaw?.data) ? extratoRaw.data : []

  return (
    <div className="space-y-5">
      {/* Seleção de conta */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold text-gray-700 mr-2">Conta:</p>
        {contas.map((c: any) => (
          <button key={c.contaBancariaId} onClick={() => setContaSelecionada(c.contaBancariaId)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
              contaSelecionada === c.contaBancariaId
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
            }`}>
            <Building2 size={14} />
            {c.nome}
            {c.banco && <span className="text-xs opacity-60">{c.banco}</span>}
          </button>
        ))}
        <Button size="sm" variant="outline" onClick={() => setShowNovaConta(true)}>
          <Plus size={13} className="mr-1" /> Nova conta
        </Button>
      </div>

      {!contaSelecionada ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Building2 size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Selecione ou crie uma conta bancária para começar</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          {kpis && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Pendentes',   value: String(kpis.pendentes),   color: 'text-amber-600' },
                { label: 'Conciliados', value: String(kpis.conciliados), color: 'text-gray-900' },
                { label: 'Créditos',    value: fmt(kpis.creditos),       color: 'text-gray-900' },
                { label: 'Débitos',     value: fmt(kpis.debitos),        color: 'text-gray-900' },
              ].map((k, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-400">{k.label}</p>
                  <p className={`text-xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Ações */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {['pendente', 'conciliado', 'ignorado', 'todas'].map(s => (
                <button key={s} onClick={() => setFiltroStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filtroStatus === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".ofx,.OFX" onChange={handleOFX} className="hidden" />
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importando}>
                {importando ? <><Loader2 size={13} className="animate-spin mr-1" /> Importando...</> : <><Upload size={13} className="mr-1" /> Importar OFX</>}
              </Button>
            </div>
          </div>

          {/* Extrato — cabeçalho congelado */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 420px)', minHeight: '200px' }}>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    {['Data', 'Descrição', 'Tipo', 'Valor', 'Status', ''].map((h, i) => (
                      <th key={i} className={`sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb] text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-2.5 ${i === 3 ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingExtrato ? (
                    <tr><td colSpan={6} className="text-center py-10 text-sm text-gray-400">Carregando...</td></tr>
                  ) : extrato.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-sm text-gray-400">
                      {filtroStatus === 'pendente' ? 'Nenhum lançamento pendente. Importe um arquivo OFX.' : 'Nenhum lançamento encontrado.'}
                    </td></tr>
                  ) : extrato.map((e: any) => (
                    <tr key={e.extratoId} className="group border-b border-gray-50 hover:bg-gray-50/80">
                      <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(e.dataMovimento)}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">{e.descricao || '—'}</p>
                        {e.referencia && <p className="text-xs text-gray-400">Ref: {e.referencia}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          e.tipo === 'credito' ? 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {e.tipo === 'credito' ? 'Crédito' : 'Débito'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right text-sm font-bold ${e.valor >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                        {fmt(e.valor)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          e.status === 'conciliado' ? 'bg-green-100 text-green-700' :
                          e.status === 'ignorado'   ? 'bg-gray-100 text-gray-500'  :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {e.status === 'conciliado' ? 'Conciliado' : e.status === 'ignorado' ? 'Ignorado' : 'Pendente'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {e.status === 'pendente' && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => conciliarMut.mutate({ extratoId: e.extratoId, acao: 'outro' })}
                              title="Marcar como conciliado" className="p-1 text-green-500 hover:text-green-700">
                              <CheckCircle size={14} />
                            </button>
                            <button onClick={() => conciliarMut.mutate({ extratoId: e.extratoId, acao: 'ignorar' })}
                              title="Ignorar lançamento" className="p-1 text-gray-300 hover:text-gray-500">
                              <EyeOff size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Painel nova conta bancária */}
      {showNovaConta && (
        <SidePanel
          titulo="Nova conta bancária"
          onClose={() => setShowNovaConta(false)}
          largura="w-[25vw] min-w-[440px]"
          rodape={
            <>
              <Button variant="outline" onClick={() => setShowNovaConta(false)}>Fechar</Button>
              <Button onClick={() => criarContaMut.mutate()} disabled={!novaConta.nome || criarContaMut.isPending}>
                {criarContaMut.isPending ? 'Criando...' : 'Criar conta'}
              </Button>
            </>
          }
        >
          <div className="p-6 space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={novaConta.nome} onChange={e => setNC('nome', e.target.value)} className="mt-1" placeholder="Ex: Conta Bradesco" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Banco</Label>
                <Input value={novaConta.banco} onChange={e => setNC('banco', e.target.value)} className="mt-1" placeholder="Bradesco, Itaú..." />
              </div>
              <div>
                <Label>Tipo</Label>
                <select value={novaConta.tipo} onChange={e => setNC('tipo', e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                  <option value="investimento">Investimento</option>
                </select>
              </div>
              <div>
                <Label>Agência</Label>
                <Input value={novaConta.agencia} onChange={e => setNC('agencia', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Conta</Label>
                <Input value={novaConta.conta} onChange={e => setNC('conta', e.target.value)} className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Saldo inicial (R$)</Label>
                <Input type="number" step="0.01" inputMode="decimal" value={novaConta.saldoInicial}
                  onChange={e => setNC('saldoInicial', e.target.value)} className="sem-spinner mt-1" placeholder="0,00" />
              </div>
            </div>
          </div>
        </SidePanel>
      )}
    </div>
  )
}