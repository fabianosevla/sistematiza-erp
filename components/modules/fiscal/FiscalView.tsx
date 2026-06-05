'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Play, Square, FileText, AlertTriangle, CheckCircle, Clock, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface Props { tenantSlug: string }

function formatCents(c: number) {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pendente:   { label: 'Pendente',   color: 'secondary' },
  autorizada: { label: 'Autorizada', color: 'default' },
  cancelada:  { label: 'Cancelada',  color: 'destructive' },
  rejeitada:  { label: 'Rejeitada',  color: 'destructive' },
}

const TIPOS_NOTA = ['NFC-e', 'NF-e', 'NFS-e']

export default function FiscalView({ tenantSlug }: Props) {
  const qc = useQueryClient()
  const api = `/api/${tenantSlug}/fiscal`
  const [aba, setAba]                     = useState<'pdv' | 'nfe-saida' | 'nfe-entrada' | 'relatorios'>('pdv')
  const [filtroTipo, setFiltroTipo]       = useState('NFC-e')
  const [showNovaNota, setShowNovaNota]   = useState(false)
  const [showCancelar, setShowCancelar]   = useState<number | null>(null)
  const [motivoCancelamento, setMotivo]   = useState('')

  // Turno
  const [showAbrirTurno, setShowAbrirTurno] = useState(false)
  const [operador, setOperador]             = useState('')
  const [valorAbertura, setValorAbertura]   = useState('0')

  const { data: turnoData } = useQuery({
    queryKey: ['turno', tenantSlug],
    queryFn:  async () => (await fetch(`${api}?turno=true`)).json(),
    refetchInterval: 30000,
  })

  const { data: notasData, isLoading } = useQuery({
    queryKey: ['notas', tenantSlug, filtroTipo],
    queryFn:  async () => (await fetch(`${api}?tipo=${filtroTipo}`)).json(),
  })

  const abrirTurnoMut = useMutation({
    mutationFn: () => fetch(`${api}?action=abrir-turno`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operador, numeroCaixa: 1, valorAbertura: Math.round(parseFloat(valorAbertura) * 100) }),
    }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['turno', tenantSlug] }); setShowAbrirTurno(false) },
  })

  const fecharTurnoMut = useMutation({
    mutationFn: (turnoId: number) => fetch(`${api}?action=fechar-turno`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnoId, valorFechamento: 0 }),
    }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turno', tenantSlug] }),
  })

  const emitirMut = useMutation({
    mutationFn: (notaId: number) => fetch(`${api}?action=emitir`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notaId }),
    }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notas', tenantSlug] }),
  })

  const cancelarMut = useMutation({
    mutationFn: (notaId: number) => fetch(`${api}?action=cancelar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notaId, motivo: motivoCancelamento }),
    }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notas', tenantSlug] }); setShowCancelar(null) },
  })

  const turno = turnoData?.data
  const notas = notasData?.data ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Fiscal</h1>
          <p className="text-sm text-gray-400 mt-0.5">NFC-e, NF-e e NFS-e via Focus NFe</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          { value: 'pdv',         label: 'PDV / Caixa' },
          { value: 'nfe-saida',   label: 'NF-e Saída' },
          { value: 'nfe-entrada', label: 'NF-e Entrada' },
          { value: 'relatorios',  label: 'Relatórios' },
        ] as const).map(a => (
          <button key={a.value} onClick={() => setAba(a.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${aba === a.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {a.label}
          </button>
        ))}
      </div>

      {/* PDV */}
      {aba === 'pdv' && (
        <div className="space-y-4">
          {/* Turno */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">Turno de Caixa</h2>
                {turno ? (
                  <p className="text-xs text-gray-400 mt-1">
                    Caixa #{turno.numeroCaixa} — {turno.operador} — aberto às {new Date(turno.abertoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">Nenhum turno aberto</p>
                )}
              </div>
              <div className="flex gap-2">
                {!turno ? (
                  <Button onClick={() => setShowAbrirTurno(true)} size="sm">
                    <Play size={14} className="mr-1.5" /> Abrir turno
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="text-red-500 border-red-200"
                    onClick={() => { if (confirm('Fechar o turno de caixa?')) fecharTurnoMut.mutate(turno.turnoId) }}>
                    <Square size={14} className="mr-1.5" /> Fechar turno
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* NFC-e */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">NFC-e — Nota Fiscal do Consumidor</h2>
              <Button size="sm" onClick={() => { setFiltroTipo('NFC-e'); setShowNovaNota(true) }} disabled={!turno}>
                <Plus size={14} className="mr-1.5" /> Nova NFC-e
              </Button>
            </div>
            {!turno && (
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle size={15} className="text-amber-500" />
                <p className="text-sm text-amber-700">Abra o turno de caixa para emitir NFC-e.</p>
              </div>
            )}
          </div>

          {/* Lista NFC-e */}
          <NotasList notas={notas.filter((n: any) => n.tipo === 'NFC-e')} isLoading={isLoading}
            onEmitir={id => emitirMut.mutate(id)}
            onCancelar={id => { setShowCancelar(id); setMotivo('') }} />
        </div>
      )}

      {/* NF-e Saída */}
      {aba === 'nfe-saida' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-700">Notas Fiscais de Saída (Modelo 55)</h2>
            <Button size="sm" onClick={() => { setFiltroTipo('NF-e'); setShowNovaNota(true) }}>
              <Plus size={14} className="mr-1.5" /> Nova NF-e
            </Button>
          </div>
          <NotasList notas={notas.filter((n: any) => n.tipo === 'NF-e')} isLoading={isLoading}
            onEmitir={id => emitirMut.mutate(id)}
            onCancelar={id => { setShowCancelar(id); setMotivo('') }} />
        </div>
      )}

      {/* NF-e Entrada */}
      {aba === 'nfe-entrada' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-700">Notas de Entrada de Fornecedores</h2>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <FileText size={32} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">Registro de notas de entrada via chave de acesso.</p>
            <p className="text-xs text-gray-300 mt-1">Em desenvolvimento — disponível na próxima versão.</p>
          </div>
        </div>
      )}

      {/* Relatórios */}
      {aba === 'relatorios' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { titulo: 'Relatório NFC-e',              desc: 'NFC-e emitidas, canceladas e inutilizadas' },
            { titulo: 'Relatório NF-e Saída',         desc: 'Resumo sintético/analítico das saídas' },
            { titulo: 'Apuração ICMS',                desc: 'Base de cálculo e valor por período' },
            { titulo: 'Apuração PIS/COFINS',          desc: 'Apuração por período' },
            { titulo: 'Resumo por Forma de Pagamento',desc: 'Totais NFC-e por forma de pagamento' },
            { titulo: 'Resumo Mensal',                desc: 'Totais de emissões por mês' },
          ].map(r => (
            <div key={r.titulo} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-sm font-semibold text-gray-900">{r.titulo}</p>
              <p className="text-xs text-gray-400 mt-1">{r.desc}</p>
              <p className="text-xs text-amber-600 mt-2 bg-amber-50 rounded px-2 py-1">Disponível após configuração do Focus NFe</p>
            </div>
          ))}
        </div>
      )}

      {/* Modal Abrir Turno */}
      {showAbrirTurno && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Abrir Turno de Caixa</h2>
              <button onClick={() => setShowAbrirTurno(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><Label>Operador *</Label><Input value={operador} onChange={e => setOperador(e.target.value)} className="mt-1" placeholder="Seu nome" autoFocus /></div>
              <div><Label>Valor de abertura (R$)</Label><Input type="number" min="0" step="0.01" value={valorAbertura} onChange={e => setValorAbertura(e.target.value)} className="mt-1" /></div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowAbrirTurno(false)}>Cancelar</Button>
                <Button onClick={() => abrirTurnoMut.mutate()} disabled={!operador || abrirTurnoMut.isPending}>Abrir turno</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cancelamento */}
      {showCancelar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Cancelar Nota</h2>
              <button onClick={() => setShowCancelar(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <Label>Justificativa do cancelamento *</Label>
                <textarea value={motivoCancelamento} onChange={e => setMotivo(e.target.value)} rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none"
                  placeholder="Mínimo 15 caracteres..." />
                <p className="text-xs text-gray-400 mt-1">{motivoCancelamento.length} caracteres (mín. 15)</p>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowCancelar(null)}>Voltar</Button>
                <Button className="bg-red-500 hover:bg-red-600" onClick={() => cancelarMut.mutate(showCancelar)}
                  disabled={motivoCancelamento.length < 15 || cancelarMut.isPending}>
                  Confirmar cancelamento
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NotasList({ notas, isLoading, onEmitir, onCancelar }: {
  notas: any[]; isLoading: boolean
  onEmitir: (id: number) => void; onCancelar: (id: number) => void
}) {
  if (isLoading) return <div className="text-center py-8 text-sm text-gray-400">Carregando...</div>
  if (notas.length === 0) return (
    <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
      <p className="text-sm text-gray-400">Nenhuma nota encontrada.</p>
    </div>
  )
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Tipo</th>
            <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Número</th>
            <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Destinatário</th>
            <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Status</th>
            <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Total</th>
            <th className="px-4 py-3 w-32" />
          </tr>
        </thead>
        <tbody>
          {notas.map((n: any) => {
            const s = STATUS_MAP[n.status] ?? STATUS_MAP.pendente
            return (
              <tr key={n.notaId} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-3"><Badge variant="outline">{n.tipo}</Badge></td>
                <td className="px-4 py-3 text-sm font-mono text-gray-600">{n.numero ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{n.razaoSocial ?? 'Consumidor Final'}</td>
                <td className="px-4 py-3"><Badge variant={s.color as any}>{s.label}</Badge></td>
                <td className="px-4 py-3 text-right text-sm font-semibold">{(n.valorTotal / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {n.status === 'pendente' && (
                      <button onClick={() => onEmitir(n.notaId)} className="text-xs text-green-600 hover:text-green-700 font-medium">Emitir</button>
                    )}
                    {n.danfeUrl && (
                      <a href={n.danfeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-700">DANFE</a>
                    )}
                    {n.status === 'autorizada' && (
                      <button onClick={() => onCancelar(n.notaId)} className="text-xs text-red-500 hover:text-red-600">Cancelar</button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}