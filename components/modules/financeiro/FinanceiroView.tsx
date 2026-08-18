'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, Printer, Plus, X, Trash2, Pencil } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { Button }       from '@/components/ui/button'
import { Input }        from '@/components/ui/input'
import { Label }        from '@/components/ui/label'
import { useToast }     from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { SidePanel }    from '@/components/ui/SidePanel'
import { InfoTip }      from '@/components/ui/InfoTip'
import ContasPagarView   from './ContasPagarView'
import ContasReceberView from './ContasReceberView'
import HistoricoCaixaTab from '@/components/modules/caixa/HistoricoCaixaTab'
import { fmtMoeda as fmt, fmtData } from '@/lib/format'

interface Props { tenantSlug: string }


const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CORES  = ['#2ecc71','#3498db','#e74c3c','#f39c12','#9b59b6','#1abc9c']
const fmtPct = (n: number) => `${n.toFixed(1)}%`

const CATEGORIAS_DESPESA = [
  'Aluguel', 'Água e Luz', 'Internet', 'Telefone', 'Funcionários',
  'Matéria-prima', 'Embalagens', 'Marketing', 'Transporte', 'Manutenção', 'Outros',
]

// 'conciliacao' saiu: era o importador de extrato bancário OFX, ferramenta de
// escritório contábil que ninguém usava aqui.
type Aba = 'despesas' | 'dre' | 'gastos-fixos' | 'demonstrativo' | 'a-pagar' | 'a-receber' | 'caixa'

export default function FinanceiroView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/financeiro`
  const apiGastos = `/api/${tenantSlug}/financeiro/gastos-fixos`

  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())
  const [aba, setAba] = useState<Aba>('despesas')

  // ── Editar / salvar — Gastos Fixos ────────────────────────────────────────
  // A grade salvava célula por célula, direto no servidor, a cada clique fora
  // do campo — bem "planilha", sem chance de revisar antes de gravar. Agora
  // fica travada até "Editar"; o que for digitado fica só no navegador e só
  // vai para o servidor no "Salvar".
  const [editandoGastos, setEditandoGastos]   = useState(false)
  const [gastosPendentes, setGastosPendentes] = useState<Record<string, number>>({})
  const [salvandoGastos, setSalvandoGastos]   = useState(false)

  // ── Período para DRE e Demonstrativo ────────────────────────────────────
  type Periodo = 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'tudo'
  const [periodo, setPeriodo] = useState<Periodo>('mensal')

  // Calcula o intervalo de meses com base no período selecionado e no mês atual
  function calcularIntervalo(): { mesInicio: number; mesFim: number; anoInicio: number; anoFim: number } {
    const m = mes; const a = ano
    if (periodo === 'mensal')     return { mesInicio: m, mesFim: m, anoInicio: a, anoFim: a }
    if (periodo === 'trimestral') {
      const trimestre = Math.ceil(m / 3)
      return { mesInicio: (trimestre - 1) * 3 + 1, mesFim: trimestre * 3, anoInicio: a, anoFim: a }
    }
    if (periodo === 'semestral') {
      return m <= 6
        ? { mesInicio: 1, mesFim: 6, anoInicio: a, anoFim: a }
        : { mesInicio: 7, mesFim: 12, anoInicio: a, anoFim: a }
    }
    if (periodo === 'anual') return { mesInicio: 1, mesFim: 12, anoInicio: a, anoFim: a }
    // tudo — desde jan/ano até mês atual
    return { mesInicio: 1, mesFim: m, anoInicio: a, anoFim: a }
  }

  // ── Form Despesa ────────────────────────────────────────────────────────
  const [showDespesa, setShowDespesa] = useState(false)
  const [editDespesa, setEditDespesa] = useState<any>(null)
  const [confirmDel, setConfirmDel]   = useState<any>(null)
  const [despForm, setDespForm] = useState({
    nome: '', valor: '', categoria: CATEGORIAS_DESPESA[0],
    dataDespesa: new Date().toISOString().slice(0, 10),
    // Vazia = a vista. E ela que decide em que mes a despesa pesa no DRE.
    dataPagamento: '',
    recorrente: false,
  })
  const setDF = (k: string, v: any) => setDespForm(p => ({ ...p, [k]: v }))

  // ── Config ──────────────────────────────────────────────────────────────
  const { data: configRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
    staleTime: 60000,
  })
  const config = configRaw?.data

  // ── Queries ─────────────────────────────────────────────────────────────
  const { data: kpisRaw } = useQuery({
    queryKey: ['fin-kpis', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?tipo=kpis&mes=${mes}&ano=${ano}`)).json(),
    refetchInterval: 60000,
  })

  const { data: despesasRaw, isLoading: loadDespesas } = useQuery({
    queryKey: ['fin-despesas', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?mes=${mes}&ano=${ano}`)).json(),
    enabled:  aba === 'despesas',
  })

  // DRE mensal — sempre busca para qualquer período (base de dados)
  const { data: dreRaw } = useQuery({
    queryKey: ['fin-dre', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?tipo=dre&mes=${mes}&ano=${ano}`)).json(),
    enabled:  aba === 'dre',
  })

  // Demonstrativo anual — usado para períodos multi-mês no DRE
  const { data: dreDemoAnualRaw } = useQuery({
    queryKey: ['fin-dre-demo', tenantSlug, ano],
    queryFn:  async () => (await fetch(`${api}?tipo=demonstrativo&ano=${ano}`)).json(),
    enabled:  aba === 'dre' && periodo !== 'mensal',
  })

  const { data: gastosRaw } = useQuery({
    queryKey: ['fin-gastos', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${apiGastos}?ano=${ano}`)).json(),
    enabled:  aba === 'gastos-fixos',
  })

  const { data: demoRaw } = useQuery({
    queryKey: ['fin-demo', tenantSlug, ano],
    queryFn:  async () => (await fetch(`${api}?tipo=demonstrativo&ano=${ano}`)).json(),
    enabled:  aba === 'demonstrativo',
  })

  // ── DRE: exportar e imprimir ─────────────────────────────────────────────
  //
  // As duas saídas recebem as linhas já montadas pela tela, em vez de refazer
  // a conta. Relatório impresso que não bate com a tela é pior que relatório
  // nenhum: quem confere passa a duvidar dos dois.
  function exportarDreCSV(linhas: { rotulo: string; valor: number }[], titulo: string) {
    if (linhas.length === 0) { toast('Nada para exportar.', 'error'); return }
    const csv = [['Linha', 'Valor'], ...linhas.map(l => [l.rotulo, (l.valor / 100).toFixed(2)])]
      .map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `dre-${titulo.replace(/[^\w]+/g, '-').toLowerCase()}.csv`
    a.click()
  }

  function imprimirDre(
    linhas: { rotulo: string; valor: number; destaque?: boolean }[],
    titulo: string,
    rodape: string,
  ) {
    if (linhas.length === 0) { toast('Nada para imprimir.', 'error'); return }
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) { toast('Habilite pop-ups para imprimir.', 'error'); return }
    const corpo = linhas.map(l => {
      const v = (l.valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      return `<tr class="${l.destaque ? 'total' : ''}"><td>${l.rotulo}</td><td class="r">${v}</td></tr>`
    }).join('')
    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>DRE — ${titulo}</title><style>
      * { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #111; }
      body { max-width: 700px; margin: 32px auto; padding: 0 24px; }
      h1 { font-size: 20px; margin: 0 0 2px; }
      .sub { font-size: 13px; color: #666; margin: 0 0 24px; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 8px 4px; font-size: 14px; border-bottom: 1px solid #eee; }
      .r { text-align: right; font-variant-numeric: tabular-nums; }
      tr.total td { font-weight: 700; border-top: 2px solid #333; border-bottom: none; }
      .rodape { margin-top: 28px; font-size: 11px; color: #999; }
      @media print { body { margin: 0; } }
    </style></head><body>
      <h1>Demonstrativo de Resultado</h1>
      <p class="sub">${titulo}</p>
      <table>${corpo}</table>
      <p class="rodape">${rodape} &middot; gerado em ${new Date().toLocaleString('pt-BR')}</p>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  // ── Invalidate ──────────────────────────────────────────────────────────
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['fin-kpis',     tenantSlug] })
    qc.invalidateQueries({ queryKey: ['fin-despesas', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['fin-dre',      tenantSlug] })
    qc.invalidateQueries({ queryKey: ['fin-demo',     tenantSlug] })
  }

  // ── Mutations Despesa ────────────────────────────────────────────────────
  const salvarDespMut = useMutation({
    mutationFn: async () => {
      const url    = editDespesa ? `${api}/${editDespesa.despesaId}` : api
      const method = editDespesa ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome:       despForm.nome,
          categoria:  despForm.categoria,
          valor:      Math.round(parseFloat(despForm.valor.replace(',', '.') || '0') * 100),
          dataDespesa: despForm.dataDespesa,
          // Vazio vira null: a vista, e a competencia cai na data da compra.
          dataPagamento: despForm.dataPagamento || null,
          recorrente: despForm.recorrente,
          // NAO mandar mes/ano daqui. Eram o mes do FILTRO DE PERIODO, e o
          // servidor lhes dava prioridade sobre a data digitada — lancar uma
          // despesa de setembro olhando agosto gravava agosto. Cartao QA #84.
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: (d: any) => {
      inv()
      const criando = !editDespesa
      // Cadastrar fecha o painel (pedido de QA #95). Editar continua aberto —
      // ali o operador provavelmente vai ajustar mais de um campo.
      if (criando) {
        setShowDespesa(false)
        setEditDespesa(null)
      }
      toast(criando ? 'Despesa lancada!' : 'Despesa atualizada!')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  const excluirDespMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao excluir')
      return d
    },
    // Excluir fecha: o registro deixou de existir.
    onSuccess: () => { inv(); setShowDespesa(false); setEditDespesa(null); toast('Despesa excluída.') },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  // ── Mutation Gastos Fixos ────────────────────────────────────────────────
  const [showGasto, setShowGasto] = useState(false)
  const [gastoForm, setGastoForm] = useState({ categoria: '', valor: '', mes: String(now.getMonth() + 1), ano: String(now.getFullYear()) })
  const setGF = (k: string, v: string) => setGastoForm(p => ({ ...p, [k]: v }))

  const salvarGastoMut = useMutation({
    mutationFn: async () => {
      // 1. Cria a categoria
      const resCat = await fetch(`${apiGastos}/categorias`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome:  gastoForm.categoria.trim(),
          ordem: 99,
        }),
      })
      const dCat = await resCat.json()
      if (!resCat.ok) throw new Error(dCat.message ?? 'Erro ao criar categoria')

      // 2. Grava o valor no mês escolhido.
      //    Antes isto não existia: o modal pedia valor, mês e ano e descartava
      //    os três — a categoria nascia zerada e só era preenchida editando a
      //    grade depois.
      const categoriaId = dCat?.data?.categoriaId ?? dCat?.categoriaId
      const valorCent   = Math.round(parseFloat(String(gastoForm.valor).replace(',', '.') || '0') * 100)

      if (!categoriaId) {
        throw new Error('Categoria criada, mas o valor não pôde ser gravado. Informe o valor na grade.')
      }

      if (valorCent > 0) {
        const resVal = await fetch(apiGastos, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoriaId,
            ano:   Number(gastoForm.ano),
            mes:   Number(gastoForm.mes),
            valor: valorCent,
          }),
        })
        const dVal = await resVal.json()
        if (!resVal.ok) throw new Error(dVal.message ?? 'Categoria criada, mas o valor não foi salvo')
      }

      return { categoriaId, anoInformado: Number(gastoForm.ano) }
    },
    onSuccess: (r: any) => {
      // Se o ano informado for outro, a grade pula para ele — senão o valor
      // sumiria de vista e pareceria não ter sido salvo.
      if (r?.anoInformado && r.anoInformado !== ano) setAno(r.anoInformado)
      qc.invalidateQueries({ queryKey: ['fin-gastos', tenantSlug] })
      // Painel continua aberto e o formulario e limpo: cadastrar gasto fixo
      // e tarefa em serie — aluguel, luz, internet — e fechar a cada um
      // obrigaria a reabrir toda vez.
      setGastoForm({ categoria: '', valor: '', mes: String(mes), ano: String(ano) })
      toast('Categoria criada com o valor lançado!')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  // ── Dados derivados ──────────────────────────────────────────────────────
  const kpis        = kpisRaw?.data
  const despesas    = Array.isArray(despesasRaw?.data) ? despesasRaw.data : []
  const dre         = dreRaw?.data  // DRE mensal
  const dreDemoAnual = Array.isArray(dreDemoAnualRaw?.data) ? dreDemoAnualRaw.data : []
  const gastos      = Array.isArray(gastosRaw?.data) ? gastosRaw.data : []
  const demo        = Array.isArray(demoRaw?.data) ? demoRaw.data : []

  function navMes(delta: number) {
    setMes(prev => {
      const n = prev + delta
      if (n > 12) { setAno(a => a + 1); return 1 }
      if (n < 1)  { setAno(a => a - 1); return 12 }
      return n
    })
  }

  function exportCSV(data: any[], prefix: string) {
    if (!data.length) return
    const keys = Object.keys(data[0])
    const csv  = [keys.join(','), ...data.map(r => keys.map(k => `"${(r as any)[k] ?? ''}"`).join(','))].join('\n')
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    a.download = `${prefix}-${ano}-${String(mes).padStart(2, '0')}.csv`
    a.click()
  }

  // Abas fixas. Não dependem mais de flag em Configurações: aba não é módulo,
  // e esconder "A Receber" fazia a conta gerada pela entrega de um pedido
  // existir sem lugar para ser vista.
  const ABAS_BASE: { key: Aba; label: string }[] = [
    { key: 'despesas',      label: 'Despesas'      },
    { key: 'dre',           label: 'DRE'           },
    { key: 'gastos-fixos',  label: 'Gastos Fixos'  },
    { key: 'demonstrativo', label: 'Demonstrativo' },
    { key: 'a-pagar',       label: 'A Pagar'       },
    { key: 'a-receber',     label: 'A Receber'     },
    // Caixa é controle de dinheiro, e por isso mora aqui — não no fiscal,
    // onde estava por acidente de história. A operação (abrir, sangria,
    // fechar) fica no PDV, com o operador; aqui é a leitura do gestor.
    //
    // Só aparece com o controle contratado. Módulo desligado tem que esconder
    // TUDO que é dele, não só o menu — foi o princípio aplicado ao fiscal, e
    // esta aba tinha ficado de fora.
    ...(config?.turnoCaixaAtivo ? [{ key: 'caixa' as Aba, label: 'Caixa' }] : []),
  ]

  // KPIs calculados do DRE
  const receitaMes  = kpis?.receitaMes  ?? 0
  const despesasMes = kpis?.despesasMes ?? 0
  const taxasMes    = kpis?.taxasMes    ?? 0
  const resultado   = kpis?.resultado   ?? 0
  const margemPct   = receitaMes > 0 ? (resultado / receitaMes) * 100 : 0

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-400 mt-0.5">Controle financeiro completo</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navMes(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[110px] text-center">
            {MESES[mes - 1]} {ano}
          </span>
          <button onClick={() => navMes(1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Receita',   value: fmt(receitaMes),  color: 'text-green-600' },
          { label: 'Taxas',     value: fmt(taxasMes),    color: 'text-red-400'   },
          { label: 'Despesas',  value: fmt(despesasMes), color: 'text-red-600'   },
          { label: 'Resultado', value: fmt(resultado),   color: resultado >= 0 ? 'text-green-600' : 'text-red-600' },
          { label: 'Margem',    value: fmtPct(margemPct), color: 'text-gray-600' },
        ].map((k, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">{k.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-100 mb-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {ABAS_BASE.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a.key ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ABA: DESPESAS */}
      {aba === 'despesas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{despesas.length} lançamento(s)</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportCSV(despesas, 'despesas')}>
                <Download size={13} className="mr-1" /> CSV
              </Button>
              <Button size="sm" onClick={() => { setEditDespesa(null); setDespForm({ nome: '', valor: '', categoria: CATEGORIAS_DESPESA[0], dataDespesa: new Date().toISOString().slice(0, 10), dataPagamento: '', recorrente: false }); setShowDespesa(true) }}>
                <Plus size={13} className="mr-1" /> Nova despesa
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Nome', 'Categoria', 'Compra', 'Pagamento', 'Recorrente', 'Valor', ''].map((h, i) => (
                    <th key={i} className={`text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3 ${i === 5 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadDespesas ? (
                  <tr><td colSpan={7} className="text-center py-8 text-sm text-gray-400">Carregando...</td></tr>
                ) : despesas.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-sm text-gray-400">Nenhuma despesa neste período.</td></tr>
                ) : despesas.map((d: any) => (
                  <tr key={d.despesaId ?? d.despesa_id} className="group border-b border-gray-50 hover:bg-gray-50/80">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.nome ?? d.descricao}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{d.categoria || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {/* INVALID DATE.
                          Antes: new Date(valor + 'T12:00:00'). Isso só vale se
                          o valor for AAAA-MM-DD puro, e a API devolve
                          timestamp completo — o resultado era
                          "2026-08-01T00:00:00.000ZT12:00:00", que não é data.
                          fmtData lê dia/mês/ano do ISO sem passar por fuso. */}
                      {fmtData(d.data_despesa ?? d.dataDespesa)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {/* Sem data de pagamento a despesa e a vista: mostrar o
                          traco e mais honesto que repetir a data da compra. */}
                      {(d.data_pagamento ?? d.dataPagamento)
                        ? fmtData(d.data_pagamento ?? d.dataPagamento)
                        : <span className="text-gray-300">à vista</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{d.recorrente ? '✓' : '—'}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">{fmt(d.valor)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 justify-end">
                        <button onClick={() => {
                          setEditDespesa(d)
                          setDespForm({
                            nome: d.nome ?? d.descricao ?? '',
                            valor: (d.valor / 100).toFixed(2),
                            categoria: d.categoria ?? '',
                            dataDespesa: (d.data_despesa || d.dataDespesa)?.slice(0, 10) ?? '',
                            dataPagamento: (d.data_pagamento || d.dataPagamento)?.slice(0, 10) ?? '',
                            recorrente: d.recorrente ?? false,
                          })
                          setShowDespesa(true)
                        }} className="p-1 text-gray-400 hover:text-gray-600">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmDel(d)} className="p-1 text-gray-300 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {despesas.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-gray-600">Total</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-red-600">
                      {fmt(despesas.reduce((a: number, d: any) => a + (d.valor ?? 0), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ABA: DRE */}
      {aba === 'dre' && (() => {
        const { mesInicio, mesFim, anoInicio, anoFim } = calcularIntervalo()
        // Para período multi-mês: usa dreDemoAnual (demonstrativo anual filtrado)
        const fonteDados = periodo === 'mensal' ? [] : dreDemoAnual
        const mesesDoPeriodo = fonteDados.filter((m: any) => {
          return Number(m.mesNum) >= mesInicio && Number(m.mesNum) <= mesFim
        })
        const receitaPeriodo  = mesesDoPeriodo.reduce((a: number, m: any) => a + m.receita, 0)
        const taxasPeriodo    = mesesDoPeriodo.reduce((a: number, m: any) => a + (m.taxas ?? 0), 0)
        const despesasPeriodo = mesesDoPeriodo.reduce((a: number, m: any) => a + m.despesas + m.fixos, 0)
        // Resultado acumulado: soma de todos os resultados mensais (positivos e negativos)
        const resultadoAcumulado = mesesDoPeriodo.reduce((a: number, m: any) => a + m.resultado - m.fixos, 0)
        const margemPeriodo = receitaPeriodo > 0 ? (resultadoAcumulado / receitaPeriodo) * 100 : 0
        // Para período mensal, usa o DRE do servidor (mais preciso com gastos fixos)
        const dreExibir = periodo === 'mensal' ? dre : null  // DRE mensal

        // Fonte única das linhas do DRE. Tela, CSV e impressão leem daqui —
        // relatório impresso que não bate com a tela é pior que relatório
        // nenhum, porque quem confere passa a duvidar dos dois.
        const linhasDre: any[] = (periodo === 'mensal' && dreExibir ? [
          { label: '(+) Receita Bruta',      value: dreExibir.receita ?? 0, color: 'text-green-600' },
          { label: '(-) Taxas de pagamento', value: -(dreExibir.taxasPagamento ?? 0), color: 'text-red-500' },
          { label: '(=) Receita Líquida',    value: dreExibir.receitaLiquida ?? dreExibir.receita ?? 0, color: 'text-green-700', bold: true },
          { label: '(-) Total Despesas',     value: -(dreExibir.totalDespesas ?? 0), color: 'text-red-500' },
          { label: '(=) Resultado',          value: dreExibir.resultado ?? 0, color: (dreExibir.resultado ?? 0) >= 0 ? 'text-green-600' : 'text-red-600', bold: true, border: true },
        ] : [
          { label: '(+) Receita Bruta',      value: receitaPeriodo,                color: 'text-green-600' },
          { label: '(-) Taxas de pagamento', value: -taxasPeriodo,                 color: 'text-red-500' },
          { label: '(=) Receita Líquida',    value: receitaPeriodo - taxasPeriodo, color: 'text-green-700', bold: true },
          { label: '(-) Total Despesas',     value: -despesasPeriodo,              color: 'text-red-500' },
          { label: '(=) Resultado Acum.',    value: resultadoAcumulado, color: resultadoAcumulado >= 0 ? 'text-green-600' : 'text-red-600', bold: true, border: true },
        ])
        const tituloDre = periodo === 'mensal'
          ? `${MESES[mes - 1]}/${ano}`
          : `${MESES[mesInicio - 1]}–${MESES[mesFim - 1]}/${ano}`

        return (
        <div className="space-y-4">
          {/* Seletor de período */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm text-gray-500">Período:</span>
            <select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)}
              className="h-8 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
              <option value="tudo">Todo o período</option>
            </select>
            {periodo !== 'mensal' && mesesDoPeriodo.length > 0 && (
              <span className="text-xs text-gray-400">
                {MESES[mesInicio - 1]}/{anoInicio} → {MESES[mesFim - 1]}/{anoFim}
                {' '}({mesesDoPeriodo.length} meses)
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm"
                onClick={() => imprimirDre(
                  linhasDre.map(l => ({ rotulo: l.label, valor: l.value, destaque: l.bold })),
                  tituloDre,
                  'Inclui gastos fixos do período.',
                )}>
                <Printer size={13} className="mr-1.5" /> Imprimir
              </Button>
              <Button variant="outline" size="sm"
                onClick={() => exportarDreCSV(
                  linhasDre.map(l => ({ rotulo: l.label, valor: l.value })),
                  tituloDre,
                )}>
                <Download size={13} className="mr-1.5" /> CSV
              </Button>
            </div>
          </div>

          {periodo === 'mensal' && !dre ? (
            <p className="text-sm text-gray-400 text-center py-12">Carregando DRE...</p>
          ) : periodo !== 'mensal' && mesesDoPeriodo.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Sem dados para o período. Aguarde carregar...</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">DRE — {periodo === 'mensal' ? `${MESES[mes-1]}/${ano}` : `${MESES[mesInicio-1]}–${MESES[mesFim-1]}/${ano}`}</h3>
                <div className="space-y-3">
                  {(linhasDre).map((item: any, i) => (
                    <div key={i} className={`flex justify-between items-center ${item.border ? 'border-t border-gray-100 pt-3' : ''}`}>
                      <span className={`text-sm ${item.bold ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{item.label}</span>
                      <span className={`text-sm ${item.bold ? 'font-bold' : ''} ${item.color}`}>{item.isPct ? fmtPct(item.value) : fmt(item.value)}</span>
                    </div>
                  ))}
                </div>

                {/* Despesas por categoria */}
                {dre?.porCategoria && Object.keys(dre.porCategoria).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Despesas por categoria</p>
                    {Object.entries(dre.porCategoria).map(([cat, val]: any, i) => (
                      <div key={i} className="flex justify-between text-xs py-1">
                        <span className="text-gray-500">{cat}</span>
                        <span className="font-medium text-red-500">{fmt(val)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Receita vs Despesas</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[{ name: MESES[mes-1], receita: (dre?.receita ?? 0)/100, despesas: (dre?.totalDespesas ?? 0)/100 }]} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: unknown) => [`R$ ${Number(v).toLocaleString('pt-BR')}`, '']} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="receita"  fill="#2ecc71" radius={[4,4,0,0]} name="Receita" />
                    <Bar dataKey="despesas" fill="#e74c3c" radius={[4,4,0,0]} name="Despesas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
        )
      })()}

      {/* ABA: GASTOS FIXOS — grade categoria × mês */}
      {aba === 'gastos-fixos' && (() => {
        const gastosData  = gastosRaw?.data
        const categorias  = Array.isArray(gastosData?.categorias) ? gastosData.categorias : []
        const grade       = gastosData?.grade ?? {}

        function chave(categoriaId: number, m: number) { return `${categoriaId}-${m}` }

        // Valor efetivo de uma célula: o que está pendente de salvar, ou o
        // que já está gravado no servidor. É o que a grade mostra e soma —
        // sem isso, digitar um valor novo só apareceria depois do "Salvar".
        function valorEfetivo(categoriaId: number, m: number): number {
          const k = chave(categoriaId, m)
          return k in gastosPendentes ? gastosPendentes[k] : (grade[categoriaId]?.[m] ?? 0)
        }

        async function salvarGastosTudo() {
          const entradas = Object.entries(gastosPendentes)
          if (entradas.length === 0) { setEditandoGastos(false); return }

          setSalvandoGastos(true)
          try {
            const respostas = await Promise.all(entradas.map(([k, valor]) => {
              const [categoriaId, m] = k.split('-').map(Number)
              return fetch(`/api/${tenantSlug}/financeiro/gastos-fixos`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoriaId, ano, mes: m, valor }),
              })
            }))
            if (respostas.some(r => !r.ok)) throw new Error('Falha ao salvar uma ou mais células')

            qc.invalidateQueries({ queryKey: ['fin-gastos', tenantSlug] })
            setGastosPendentes({})
            setEditandoGastos(false)
            toast(`${entradas.length} célula${entradas.length > 1 ? 's' : ''} de gastos fixos salva${entradas.length > 1 ? 's' : ''}!`)
          } catch {
            toast('Erro ao salvar os gastos fixos. Nada foi perdido — tente salvar de novo.', 'error')
          } finally {
            setSalvandoGastos(false)
          }
        }

        function cancelarEdicaoGastos() {
          setGastosPendentes({})
          setEditandoGastos(false)
        }

        const totalPorMes = Array.from({ length: 12 }, (_, i) => {
          return categorias.reduce((sum: number, cat: any) => sum + valorEfetivo(cat.categoriaId, i + 1), 0)
        })

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 inline-flex items-center gap-1">
                Grade anual de gastos fixos — {ano}
                <InfoTip titulo="Gasto fixo repete sozinho">
                  Um valor lançado num mês já vale para os meses seguintes, até alguém lançar um valor diferente. Meses anteriores nunca mudam.
                </InfoTip>
              </p>
              <div className="flex gap-2">
                {!editandoGastos ? (
                  <Button variant="outline" size="sm" onClick={() => setEditandoGastos(true)}>
                    <Pencil size={13} className="mr-1.5" /> Editar
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={cancelarEdicaoGastos} disabled={salvandoGastos}>
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={salvarGastosTudo} disabled={salvandoGastos}>
                      {salvandoGastos ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </>
                )}
                <Button size="sm" onClick={() => { setGastoForm({ categoria: '', valor: '', mes: String(mes), ano: String(ano) }); setShowGasto(true) }}>
                  <Plus size={13} className="mr-1" /> Nova categoria
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3 w-40">Categoria</th>
                    {MESES.map(m => (
                      <th key={m} className="text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-2 py-3 w-20">{m}</th>
                    ))}
                    <th className="text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-2 py-3 w-24">Anual</th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.length === 0 ? (
                    <tr><td colSpan={14} className="text-center py-8 text-sm text-gray-400">Nenhuma categoria cadastrada.</td></tr>
                  ) : categorias.map((cat: any) => {
                    const totalAnual = Array.from({ length: 12 }, (_, i) => valorEfetivo(cat.categoriaId, i + 1)).reduce((a, b) => a + b, 0)
                    return (
                      <tr key={cat.categoriaId} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{cat.nome}</td>
                        {Array.from({ length: 12 }, (_, i) => {
                          const m   = i + 1
                          const val = valorEfetivo(cat.categoriaId, m)
                          return (
                            <td key={m} className="px-1 py-1">
                              <input
                                type="number" min="0" step="0.01"
                                disabled={!editandoGastos}
                                value={(val / 100).toFixed(2)}
                                onChange={e => {
                                  const novoVal = Math.round(parseFloat(e.target.value || '0') * 100)
                                  setGastosPendentes(prev => ({ ...prev, [chave(cat.categoriaId, m)]: novoVal }))
                                }}
                                className="sem-spinner w-full h-8 text-center text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                              />
                            </td>
                          )
                        })}
                        <td className="px-2 py-2 text-center text-sm font-semibold text-red-600">{fmt(totalAnual)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="px-4 py-2 text-xs font-bold text-gray-700">Total/mês</td>
                    {totalPorMes.map((t, i) => (
                      <td key={i} className="px-2 py-2 text-center text-xs font-bold text-red-600">
                        {t > 0 ? fmt(t) : '—'}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center text-xs font-bold text-red-600">
                      {fmt(totalPorMes.reduce((a, b) => a + b, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })()}

      {/* ABA: DEMONSTRATIVO */}
      {aba === 'demonstrativo' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Demonstrativo Anual — {ano}</h3>
              <select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)}
                className="h-7 rounded-lg border border-gray-200 px-2 text-xs focus:outline-none">
                <option value="mensal">Mensal</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
                <option value="anual">Anual</option>
                <option value="tudo">Todo o período</option>
              </select>
            </div>

            {demo.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sem dados.</p>
            ) : (() => {
              const { mesInicio, mesFim } = calcularIntervalo()
              const demoFiltrado = (periodo === 'anual' || periodo === 'tudo')
                ? demo
                : demo.filter((m: any) => m.mesNum >= mesInicio && m.mesNum <= mesFim)
              let acum = 0
              const demoComAcum = demoFiltrado.map((m: any) => {
                acum += m.resultado
                return { ...m, resultadoAcumulado: acum }
              })
              return (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Mês', 'Receita', 'Taxas', 'Despesas', 'Fixos', 'Resultado', 'Acumulado', 'Margem'].map((h, i) => (
                        <th key={i} className={`text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-4 py-3 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {demoComAcum.map((m: any, i: number) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{m.mes}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-green-600">{m.receita > 0 ? fmt(m.receita) : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-red-400">{m.taxas > 0 ? fmt(m.taxas) : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-red-500">{m.despesas > 0 ? fmt(m.despesas) : '—'}</td>
                        <td className="px-4 py-2.5 text-right text-sm text-red-400">{m.fixos > 0 ? fmt(m.fixos) : '—'}</td>
                        <td className={`px-4 py-2.5 text-right text-sm font-semibold ${m.resultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {m.receita > 0 || m.despesas > 0 ? fmt(m.resultado) : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right text-sm font-bold ${(m.resultadoAcumulado ?? m.resultado) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {m.receita > 0 || m.despesas > 0 ? fmt(m.resultadoAcumulado ?? m.resultado) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm text-gray-500">{m.receita > 0 ? `${m.margem}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td className="px-4 py-2.5 text-xs font-bold text-gray-700">Total</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-green-600">{fmt(demoComAcum.reduce((a: number, m: any) => a + m.receita, 0))}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-red-400">{fmt(demoComAcum.reduce((a: number, m: any) => a + (m.taxas ?? 0), 0))}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-red-500">{fmt(demoComAcum.reduce((a: number, m: any) => a + m.despesas, 0))}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-red-400">{fmt(demoComAcum.reduce((a: number, m: any) => a + m.fixos, 0))}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-900">{fmt(demoComAcum.reduce((a: number, m: any) => a + m.resultado, 0))}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-gray-700">{fmt(demoComAcum[demoComAcum.length - 1]?.resultadoAcumulado ?? 0)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>

                {/* Gráfico */}
                <div className="p-5 border-t border-gray-100">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={demoComAcum.map((m: any) => ({ mes: m.mes, receita: m.receita/100, despesas: (m.despesas + m.fixos + (m.taxas ?? 0))/100 }))} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: unknown) => [`R$ ${Number(v).toLocaleString('pt-BR')}`, '']} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="receita"  fill="#2ecc71" radius={[4,4,0,0]} name="Receita" />
                      <Bar dataKey="despesas" fill="#e74c3c" radius={[4,4,0,0]} name="Despesas + Fixos" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
              )
            })()}
          </div>
        </div>
      )}

      {aba === 'a-pagar'     && <ContasPagarView   tenantSlug={tenantSlug} />}
      {aba === 'a-receber'   && <ContasReceberView tenantSlug={tenantSlug} />}
      {aba === 'caixa'       && <HistoricoCaixaTab tenantSlug={tenantSlug} />}

      {/* Painel despesa */}
      {showDespesa && (
        <SidePanel
          titulo={editDespesa ? 'Editar despesa' : 'Nova despesa'}
          subtitulo={editDespesa?.nome}
          onClose={() => { setShowDespesa(false); setEditDespesa(null) }}
          largura="w-[25vw] min-w-[440px]"
          rodape={
            <>
              <Button variant="outline" onClick={() => { setShowDespesa(false); setEditDespesa(null) }}>Fechar</Button>
              <Button onClick={() => salvarDespMut.mutate()} disabled={!despForm.nome || !despForm.valor || salvarDespMut.isPending}>
                {salvarDespMut.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </>
          }
        >
            <div className="p-6 space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input value={despForm.nome} onChange={e => setDF('nome', e.target.value)} className="mt-1" autoFocus placeholder="Ex: Conta de luz" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor (R$) *</Label>
                  <Input type="number" min="0" step="0.01" inputMode="decimal" value={despForm.valor} onChange={e => setDF('valor', e.target.value)} className="sem-spinner mt-1" placeholder="0,00" />
                </div>
                <div>
                  <Label>Data da compra</Label>
                  <Input type="date" value={despForm.dataDespesa} onChange={e => setDF('dataDespesa', e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="inline-flex items-center gap-1">
                  Data do pagamento
                  <InfoTip titulo="Quando o dinheiro sai">
                    É esta data que decide em que mês a despesa entra no DRE. Deixe vazia para compra à vista.
                  </InfoTip>
                </Label>
                <Input type="date" value={despForm.dataPagamento} onChange={e => setDF('dataPagamento', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Categoria</Label>
                <select value={despForm.categoria} onChange={e => setDF('categoria', e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  {CATEGORIAS_DESPESA.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="recorrente" checked={despForm.recorrente} onChange={e => setDF('recorrente', e.target.checked)} className="rounded" />
                <Label htmlFor="recorrente" className="cursor-pointer">Despesa recorrente (repete todo mês)</Label>
              </div>
            </div>
        </SidePanel>
      )}

      {/* Painel gasto fixo */}
      {showGasto && (
        <SidePanel
          titulo="Nova categoria de gasto fixo"
          onClose={() => setShowGasto(false)}
          largura="w-[24vw] min-w-[400px]"
          rodape={
            <>
              <Button variant="outline" onClick={() => setShowGasto(false)}>Fechar</Button>
              <Button onClick={() => salvarGastoMut.mutate()} disabled={!gastoForm.categoria || !gastoForm.valor || salvarGastoMut.isPending}>
                {salvarGastoMut.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </>
          }
        >
            <div className="p-6 space-y-4">
              <div>
                <Label>Categoria *</Label>
                <Input value={gastoForm.categoria} onChange={e => setGF('categoria', e.target.value)} className="mt-1" placeholder="Ex: Aluguel" autoFocus />
              </div>
              <div>
                <Label>Valor (R$) *</Label>
                <Input type="number" min="0" step="0.01" inputMode="decimal" value={gastoForm.valor} onChange={e => setGF('valor', e.target.value)} className="sem-spinner mt-1" placeholder="0,00" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Mês</Label>
                  <select value={gastoForm.mes} onChange={e => setGF('mes', e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Ano</Label>
                  <Input type="number" value={gastoForm.ano} onChange={e => setGF('ano', e.target.value)} className="sem-spinner mt-1" />
                </div>
              </div>
            </div>
        </SidePanel>
      )}

      {confirmDel && (
        <ConfirmModal title="Excluir despesa" message={`Excluir "${confirmDel.nome ?? confirmDel.descricao}"?`}
          confirmLabel="Excluir" danger
          onConfirm={() => { excluirDespMut.mutate(confirmDel.despesaId ?? confirmDel.despesa_id); setConfirmDel(null) }}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}