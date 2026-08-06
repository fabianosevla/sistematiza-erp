'use client'
// ESTE ARQUIVO VAI EM: components/modules/plano_acao/PlanoAcaoView.tsx
//
// PLANO DE AÇÃO.
//
// A tela existia mas não seguia nada do padrão: título solto em vez de
// PageHeader, tabela crua sem cabeçalho congelado nem filtro, sem período,
// sem KPI, sem paginação. Aqui ela entra na mesma linguagem das outras.
//
// O que é uma ação: um compromisso com data, responsável e estado. Por isso a
// tela é organizada em torno de PENDENTE × CONCLUÍDA, e não de uma lista
// cronológica — o que interessa é o que ainda falta fazer.
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Check, RotateCcw, Trash2, Pencil, ChevronLeft, ChevronRight,
  Download, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { FormModal } from '@/components/ui/FormModal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import {
  SeletorPeriodo, PERIODICIDADES, intervaloDe, deslocar,
  type Periodicidade,
} from '@/components/ui/SeletorPeriodo'

interface Props { tenantSlug: string }

const POR_PAGINA = 25
const hojeISO = () => new Date().toISOString().slice(0, 10)

const fmtData = (d: any) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—'

export default function PlanoAcaoView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/plano-acao`

  // ── Período ──────────────────────────────────────────────────────────────
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('mensal')
  const [ancora, setAncora]               = useState<Date>(() => new Date())
  const [fimCustom, setFimCustom]         = useState<Date | null>(null)
  const periodo = useMemo(
    () => intervaloDe(periodicidade, ancora, fimCustom),
    [periodicidade, ancora, fimCustom],
  )

  const [statusAba, setStatusAba] = useState<'pendente' | 'concluida' | 'todas'>('pendente')
  const [filtros, setFiltros]     = useState<Record<string, string>>({})
  const [pagina, setPagina]       = useState(1)

  // ── Formulário ───────────────────────────────────────────────────────────
  const [showPainel, setShowPainel]   = useState(false)
  const [editando, setEditando]       = useState<any>(null)
  const [dataAcao, setDataAcao]       = useState(hojeISO())
  const [identificacao, setIdent]     = useState('')
  const [acao, setAcao]               = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [confirmExcluir, setConfirmExcluir] = useState<any>(null)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['plano-acao', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
  })
  const todasAcoes: any[] = Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.data?.data) ? raw.data.data : []

  // ── Recorte: período + aba de status + filtro de coluna ──────────────────
  //
  // O período corta por data_acao. Uma ação combinada para outubro não deve
  // aparecer quando se está olhando agosto, mesmo que tenha sido criada agora.
  const doPeriodo = useMemo(
    () => todasAcoes.filter(a => {
      const d = String(a.dataAcao ?? '').slice(0, 10)
      return d >= periodo.inicio && d <= periodo.fim
    }),
    [todasAcoes, periodo.inicio, periodo.fim],
  )

  const daAba = useMemo(() => {
    if (statusAba === 'todas') return doPeriodo
    return doPeriodo.filter(a => (a.status ?? 'pendente') === statusAba)
  }, [doPeriodo, statusAba])

  const itens = useMemo(() => {
    const chaves = Object.keys(filtros)
    if (chaves.length === 0) return daAba
    return daAba.filter(a => chaves.every(k => String(a[k] ?? '') === filtros[k]))
  }, [daAba, filtros])

  const opcoesFiltro = useMemo(() => {
    const mapa: Record<string, string[]> = {}
    for (const k of ['identificacao', 'responsavel']) {
      const set = new Set<string>()
      for (const a of daAba) if (a[k]) set.add(String(a[k]))
      if (set.size > 0) mapa[k] = Array.from(set).sort((x, y) => x.localeCompare(y, 'pt-BR'))
    }
    return mapa
  }, [daAba])

  const totalPaginas = Math.max(1, Math.ceil(itens.length / POR_PAGINA))
  const paginaAtual  = Math.min(pagina, totalPaginas)
  const itensPagina  = itens.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  // Ação pendente com data já passada. É o número que justifica a tela
  // existir — plano sem cobrança vira lista de boas intenções.
  const atrasadas = doPeriodo.filter(
    a => (a.status ?? 'pendente') === 'pendente' && String(a.dataAcao ?? '').slice(0, 10) < hojeISO(),
  ).length

  const kpis = [
    { rotulo: 'No período', valor: String(doPeriodo.length) },
    { rotulo: 'Pendentes',  valor: String(doPeriodo.filter(a => (a.status ?? 'pendente') === 'pendente').length) },
    { rotulo: 'Concluídas', valor: String(doPeriodo.filter(a => a.status === 'concluida').length) },
    { rotulo: 'Atrasadas',  valor: String(atrasadas), alerta: atrasadas > 0 },
  ]

  // ── Mutations ────────────────────────────────────────────────────────────
  const inv = () => qc.invalidateQueries({ queryKey: ['plano-acao', tenantSlug] })

  const salvarMut = useMutation({
    mutationFn: async () => {
      const url    = editando ? `${api}/${editando.acaoId}` : api
      const method = editando ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataAcao, identificacao, acao, responsavel }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao salvar')
      return d
    },
    // O painel NÃO fecha ao salvar. Depois de lançar, passa a editar a ação
    // recém-criada — senão um segundo clique em Salvar criaria a mesma ação
    // de novo.
    onSuccess: (d: any) => {
      inv()
      const criando = !editando
      if (criando) {
        const novoId = d?.data?.acaoId ?? d?.acaoId
        if (novoId) setEditando({ acaoId: novoId, identificacao })
      }
      toast(criando ? 'Ação criada!' : 'Ação atualizada!')
    },
    onError: (e: any) => toast(e?.message ?? 'Erro ao salvar.', 'error'),
  })

  const statusMut = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'concluir' | 'reabrir' }) => {
      const res = await fetch(`${api}/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao mudar status')
      return d
    },
    onSuccess: (_, v) => { inv(); toast(v.action === 'concluir' ? 'Ação concluída!' : 'Ação reaberta.') },
    onError: (e: any) => toast(e?.message ?? 'Erro.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao excluir')
      return d
    },
    onSuccess: () => { inv(); toast('Ação excluída.') },
    onError: (e: any) => toast(e?.message ?? 'Erro.', 'error'),
  })

  function abrirNova() {
    setEditando(null)
    setDataAcao(hojeISO()); setIdent(''); setAcao(''); setResponsavel('')
    setShowPainel(true)
  }

  function abrirEdicao(a: any) {
    setEditando(a)
    setDataAcao(String(a.dataAcao ?? '').slice(0, 10))
    setIdent(a.identificacao ?? '')
    setAcao(a.acao ?? '')
    setResponsavel(a.responsavel ?? '')
    setShowPainel(true)
  }

  function aplicarFiltro(chave: string, valor: string) {
    setFiltros(f => {
      const novo = { ...f }
      if (valor) novo[chave] = valor; else delete novo[chave]
      return novo
    })
    setPagina(1)
  }

  function exportarCSV() {
    if (itens.length === 0) { toast('Nada para exportar neste período.', 'error'); return }
    const linhas = [
      ['Data', 'Identificacao', 'Acao', 'Responsavel', 'Status', 'Concluido em'],
      ...itens.map(a => [
        fmtData(a.dataAcao), a.identificacao, a.acao, a.responsavel ?? '',
        a.status === 'concluida' ? 'Concluida' : 'Pendente',
        a.concluidoEm ? fmtData(a.concluidoEm) : '',
      ]),
    ]
    const csv = linhas.map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const el = document.createElement('a')
    el.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    el.download = `plano-acao-${periodo.inicio}-a-${periodo.fim}.csv`
    el.click()
  }

  // ── Colunas ──────────────────────────────────────────────────────────────
  const colunas: Coluna[] = [
    {
      chave: 'dataAcao', titulo: 'Data',
      render: (a: any) => {
        const atrasada = (a.status ?? 'pendente') === 'pendente' && String(a.dataAcao ?? '').slice(0, 10) < hojeISO()
        return (
          <span className={atrasada ? 'text-red-600 font-medium inline-flex items-center gap-1' : ''}>
            {atrasada && <AlertTriangle size={11} />}
            {fmtData(a.dataAcao)}
          </span>
        )
      },
    },
    {
      chave: 'identificacao', titulo: 'Identificação', filtravel: true,
      classeCelula: 'px-4 py-3 text-sm font-medium text-gray-900',
      render: (a: any) => a.identificacao,
    },
    {
      chave: 'acao', titulo: 'Ação',
      render: (a: any) => (
        <span className="text-sm text-gray-600 line-clamp-2" title={a.acao}>{a.acao}</span>
      ),
    },
    {
      chave: 'responsavel', titulo: 'Responsável', filtravel: true, esconderAte: 'md',
      render: (a: any) => a.responsavel || <span className="text-gray-300">—</span>,
    },
    {
      chave: 'status', titulo: 'Status',
      render: (a: any) => a.status === 'concluida'
        ? <Badge variant="secondary">Concluída {a.concluidoEm ? `· ${fmtData(a.concluidoEm)}` : ''}</Badge>
        : <Badge variant="default">Pendente</Badge>,
    },
  ]

  const ABAS = [
    { valor: 'pendente'  as const, rotulo: 'Pendentes' },
    { valor: 'concluida' as const, rotulo: 'Concluídas' },
    { valor: 'todas'     as const, rotulo: 'Todas' },
  ]

  return (
    <div>
      <PageHeader
        titulo="Plano de Ação"
        acoes={
          <>
            <Button variant="outline" size="sm" onClick={exportarCSV} disabled={itens.length === 0}>
              <Download size={13} className="mr-1.5" /> Exportar CSV
            </Button>
            <Button size="sm" onClick={abrirNova}>
              <Plus size={15} className="mr-1.5" /> Nova ação
            </Button>
          </>
        }
      />

      {/* ── Período ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Periodicidade</span>
          <select
            value={periodicidade}
            onChange={e => {
              const nova = e.target.value as Periodicidade
              setPeriodicidade(nova)
              if (nova !== 'customizado') setFimCustom(null)
              setPagina(1)
            }}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
          >
            {PERIODICIDADES.map(p => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
          </select>
          <InfoTip titulo="Período">Recorta pela data combinada da ação, não pela data em que ela foi criada.</InfoTip>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setAncora(a => deslocar(periodicidade, a, -1, fimCustom))}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <SeletorPeriodo
            periodicidade={periodicidade}
            valor={ancora}
            onChange={setAncora}
            fimCustom={fimCustom}
            onChangeCustom={(i, f) => { setAncora(i); setFimCustom(f) }}
          />
          <button
            onClick={() => setAncora(a => deslocar(periodicidade, a, 1, fimCustom))}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Abas de status ──────────────────────────────────────────────── */}
      <div className="border-b border-gray-100 mb-4">
        <div className="flex items-stretch">
          {ABAS.map(t => (
            <button
              key={t.valor}
              onClick={() => { setStatusAba(t.valor); setFiltros({}); setPagina(1) }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                statusAba === t.valor ? 'border-green-500 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {kpis.map((k, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 px-4 py-3.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{k.rotulo}</p>
            <p className={`text-xl font-semibold mt-1.5 truncate ${k.alerta ? 'text-red-600' : 'text-gray-900'}`}>{k.valor}</p>
          </div>
        ))}
      </div>

      {/* ── Listagem ────────────────────────────────────────────────────── */}
      <DataTable
        colunas={colunas}
        itens={itensPagina}
        chave={(a: any) => a.acaoId}
        carregando={isLoading}
        vazio={Object.keys(filtros).length > 0
          ? 'Nenhuma ação com esse filtro.'
          : 'Nenhuma ação neste período.'}
        filtros={filtros}
        onFiltrar={aplicarFiltro}
        opcoesFiltro={opcoesFiltro}
        meta={{ page: paginaAtual, totalPages: totalPaginas, total: itens.length, limit: POR_PAGINA }}
        onPageChange={setPagina}
        acoes={(a: any) => (
          <>
            {a.status === 'concluida' ? (
              <BotaoIcone titulo="Reabrir" variante="alerta"
                onClick={() => statusMut.mutate({ id: a.acaoId, action: 'reabrir' })}>
                <RotateCcw size={14} />
              </BotaoIcone>
            ) : (
              <BotaoIcone titulo="Concluir" variante="sucesso"
                onClick={() => statusMut.mutate({ id: a.acaoId, action: 'concluir' })}>
                <Check size={14} />
              </BotaoIcone>
            )}
            <BotaoIcone titulo="Editar" variante="info" onClick={() => abrirEdicao(a)}>
              <Pencil size={14} />
            </BotaoIcone>
            <BotaoIcone titulo="Excluir" variante="perigo" onClick={() => setConfirmExcluir(a)}>
              <Trash2 size={14} />
            </BotaoIcone>
          </>
        )}
      />

      {/* ── Painel ──────────────────────────────────────────────────────── */}
      {showPainel && (
        <FormModal
          titulo={editando ? 'Editar ação' : 'Nova ação'}
          subtitulo={editando ? editando.identificacao : undefined}
          onClose={() => setShowPainel(false)}
          largura="max-w-lg"
        >
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data *</Label>
                <Input type="date" value={dataAcao} onChange={e => setDataAcao(e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Responsável</Label>
                <Input value={responsavel} onChange={e => setResponsavel(e.target.value)} className="mt-1 h-9 text-sm" placeholder="Quem executa" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Identificação *</Label>
              <Input value={identificacao} onChange={e => setIdent(e.target.value)} className="mt-1 h-9 text-sm" placeholder="Ex: Manutenção da masseira" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Ação *</Label>
              <textarea
                value={acao} onChange={e => setAcao(e.target.value)} rows={5}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-green-400 resize-none"
                placeholder="Descreva o que precisa ser feito..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowPainel(false)}>Fechar</Button>
              <Button
                onClick={() => salvarMut.mutate()}
                disabled={!dataAcao || !identificacao.trim() || !acao.trim() || salvarMut.isPending}
              >
                {salvarMut.isPending ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar ação'}
              </Button>
            </div>
          </div>
        </FormModal>
      )}

      {confirmExcluir && (
        <ConfirmModal
          title="Excluir ação"
          message={`Excluir "${confirmExcluir.identificacao}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => { excluirMut.mutate(confirmExcluir.acaoId); setConfirmExcluir(null) }}
          onCancel={() => setConfirmExcluir(null)}
        />
      )}
    </div>
  )
}
