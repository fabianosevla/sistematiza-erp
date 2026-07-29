'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Gift, ChevronDown, ChevronRight, Save, MessageCircle, Percent, Clock,
  Settings, Users, Receipt, Bell, ShieldCheck, Loader2, Send, Search,
  CheckCircle, AlertTriangle, ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoTip } from '@/components/ui/InfoTip'
import { Aviso } from '@/components/ui/Aviso'
import { fmtMoeda as fmt, fmtDataHoraLocal as fmtData, fmtDataLocal as fmtDataCurta } from '@/lib/format'

interface Props { tenantSlug: string }

type Aba = 'visao' | 'clientes' | 'movimentacoes' | 'reativacao' | 'config'
type Secao = 'cashback' | 'reativacao' | 'whatsapp' | 'geral'

// ── conversões (a API trabalha em centavos e basis points) ─────────────────────
const bpToPct  = (bp: number) => (Number(bp || 0) / 100)
const pctToBp  = (p: any)     => Math.round(parseFloat(String(p).replace(',', '.') || '0') * 100)
const centToBRL = (c: number) => (Number(c || 0) / 100).toFixed(2)
const brlToCent = (v: any)    => Math.round(parseFloat(String(v).replace(',', '.') || '0') * 100)

const TIPO_CFG: Record<string, { label: string; cls: string; sinal: 1 | -1 }> = {
  credito:         { label: 'Crédito',             cls: 'bg-green-100 text-green-700',  sinal: 1 },
  uso:             { label: 'Uso',                 cls: 'bg-blue-100 text-blue-700',    sinal: -1 },
  estorno:         { label: 'Estorno (devolução)', cls: 'bg-amber-100 text-amber-700',  sinal: 1 },
  estorno_credito: { label: 'Estorno de crédito',  cls: 'bg-red-100 text-red-700',      sinal: -1 },
  ajuste:          { label: 'Ajuste',              cls: 'bg-purple-100 text-purple-700',sinal: 1 },
  expiracao:       { label: 'Expiração',           cls: 'bg-gray-100 text-gray-500',    sinal: -1 },
}

export default function FidelidadeView({ tenantSlug }: Props) {
  const qc = useQueryClient()
  const [aba, setAba]     = useState<Aba>('visao')
  const [secao, setSecao] = useState<Secao | null>('cashback')
  const [form, setForm]   = useState<any>(null)
  const [novoToken, setNovoToken] = useState('')
  const [salvo, setSalvo] = useState(false)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['fidelidade-config', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/fidelidade/config`)).json(),
  })
  const cfg = raw?.data

  useEffect(() => {
    if (!cfg) return
    setForm({
      programaAtivo:          !!cfg.programaAtivo,
      cashbackPct:            String(bpToPct(cfg.cashbackPctBp)),
      compraMinima:           centToBRL(cfg.compraMinimaCentavos),
      validadeDias:           String(cfg.validadeDias ?? 0),
      limiteUsoPct:           String(bpToPct(cfg.limiteUsoPctBp)),
      saldoMinimoUso:         centToBRL(cfg.saldoMinimoUsoCentavos),
      arredondamento:         cfg.arredondamento ?? 'centavo',
      baseCalculo:            cfg.baseCalculo ?? 'liquido',
      reativacaoAtiva:        !!cfg.reativacaoAtiva,
      diasInatividade:        String(cfg.diasInatividade ?? 30),
      repetirAviso:           !!cfg.repetirAviso,
      intervaloRepeticaoDias: String(cfg.intervaloRepeticaoDias ?? 30),
      maxAvisos:              String(cfg.maxAvisos ?? 0),
      saldoMinimoAviso:       centToBRL(cfg.saldoMinimoAvisoCentavos),
      horarioInicio:          String(cfg.horarioInicio ?? 9),
      horarioFim:             String(cfg.horarioFim ?? 20),
      waPhoneNumberId:        cfg.waPhoneNumberId ?? '',
      waBusinessAccountId:    cfg.waBusinessAccountId ?? '',
      waTemplateNome:         cfg.waTemplateNome ?? '',
      waTemplateIdioma:       cfg.waTemplateIdioma ?? 'pt_BR',
      mensagemPadrao:         cfg.mensagemPadrao ?? '',
      exigeOptin:             cfg.exigeOptin !== false,
    })
  }, [cfg])

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const salvar = useMutation({
    mutationFn: async () => {
      const payload = {
        programaAtivo:            form.programaAtivo,
        cashbackPctBp:            pctToBp(form.cashbackPct),
        compraMinimaCentavos:     brlToCent(form.compraMinima),
        validadeDias:             Number(form.validadeDias || 0),
        limiteUsoPctBp:           pctToBp(form.limiteUsoPct),
        saldoMinimoUsoCentavos:   brlToCent(form.saldoMinimoUso),
        arredondamento:           form.arredondamento,
        baseCalculo:              form.baseCalculo,
        reativacaoAtiva:          form.reativacaoAtiva,
        diasInatividade:          Number(form.diasInatividade || 0),
        repetirAviso:             form.repetirAviso,
        intervaloRepeticaoDias:   Number(form.intervaloRepeticaoDias || 0),
        maxAvisos:                Number(form.maxAvisos || 0),
        saldoMinimoAvisoCentavos: brlToCent(form.saldoMinimoAviso),
        horarioInicio:            Number(form.horarioInicio || 0),
        horarioFim:               Number(form.horarioFim || 0),
        waPhoneNumberId:          form.waPhoneNumberId,
        waBusinessAccountId:      form.waBusinessAccountId,
        waTemplateNome:           form.waTemplateNome,
        waTemplateIdioma:         form.waTemplateIdioma,
        mensagemPadrao:           form.mensagemPadrao,
        exigeOptin:               form.exigeOptin,
        ...(novoToken.trim() ? { waToken: novoToken.trim() } : {}),
      }
      const res = await fetch(`/api/${tenantSlug}/fidelidade/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao salvar configuração')
      return data
    },
    onSuccess: () => {
      setNovoToken(''); setSalvo(true); setTimeout(() => setSalvo(false), 2500)
      qc.invalidateQueries({ queryKey: ['fidelidade-config', tenantSlug] })
    },
  })

  const ABAS: { key: Aba; label: string; icon: any }[] = [
    { key: 'visao',          label: 'Visão Geral',      icon: Gift },
    { key: 'clientes',       label: 'Clientes & Saldo', icon: Users },
    { key: 'movimentacoes',  label: 'Movimentações',    icon: Receipt },
    { key: 'reativacao',     label: 'Reativação',       icon: Bell },
    { key: 'config',         label: 'Configuração',     icon: Settings },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Gift size={22} className="text-green-600" /> Fidelidade
        </h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-100 mb-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {ABAS.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a.key ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <a.icon size={14} /> {a.label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'visao'         && <VisaoTab tenantSlug={tenantSlug} programaAtivo={!!cfg?.programaAtivo} onIrConfig={() => setAba('config')} />}
      {aba === 'clientes'      && <ClientesTab tenantSlug={tenantSlug} />}
      {aba === 'movimentacoes' && <MovimentosTab tenantSlug={tenantSlug} />}
      {aba === 'reativacao'    && <ReativacaoTab tenantSlug={tenantSlug} onIrConfig={() => setAba('config')} />}

      {/* ── Configuração ─────────────────────────────────────────────────── */}
      {aba === 'config' && (
        isLoading || !form ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-12 justify-center">
            <Loader2 size={16} className="animate-spin" /> Carregando configuração...
          </div>
        ) : (
          <div className="max-w-3xl space-y-3">
            {/* Master toggle */}
            <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1">
                Programa ativo
                <InfoTip titulo="Programa ativo">
                  Liga e desliga o cashback sem apagar nenhum dado. Desligado, nenhuma venda
                  gera crédito — os saldos existentes continuam guardados.
                </InfoTip>
              </p>
              <Toggle on={form.programaAtivo} onChange={v => set('programaAtivo', v)} />
            </div>

            {/* Regras de Cashback */}
            <Accordion aberto={secao === 'cashback'} onClick={() => setSecao(secao === 'cashback' ? null : 'cashback')}
              icon={Percent} titulo="Regras de Cashback">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo label="Cashback por venda (%)"><Input value={form.cashbackPct} onChange={e => set('cashbackPct', e.target.value)} inputMode="decimal" /></Campo>
                <Campo label="Compra mínima p/ gerar (R$)"><Input value={form.compraMinima} onChange={e => set('compraMinima', e.target.value)} inputMode="decimal" /></Campo>
                <Campo label={
                  <span className="inline-flex items-center gap-1">Validade do cashback (dias)
                    <InfoTip titulo="Validade">Zero significa que o cashback não expira.</InfoTip>
                  </span>
                }>
                  <Input value={form.validadeDias} onChange={e => set('validadeDias', e.target.value)} inputMode="numeric" />
                </Campo>
                <Campo label={
                  <span className="inline-flex items-center gap-1">Limite de uso por compra (%)
                    <InfoTip titulo="Limite de uso">
                      Teto de quanto do total da venda pode ser pago com cashback.
                      100% permite quitar a venda inteira com saldo.
                    </InfoTip>
                  </span>
                }>
                  <Input value={form.limiteUsoPct} onChange={e => set('limiteUsoPct', e.target.value)} inputMode="decimal" />
                </Campo>
                <Campo label="Saldo mínimo p/ usar (R$)"><Input value={form.saldoMinimoUso} onChange={e => set('saldoMinimoUso', e.target.value)} inputMode="decimal" /></Campo>
                <Campo label={
                  <span className="inline-flex items-center gap-1">Base de cálculo
                    <InfoTip titulo="Base de cálculo">
                      Define sobre qual valor o percentual de cashback incide: o total já com
                      desconto aplicado, ou o total cheio antes do desconto.
                    </InfoTip>
                  </span>
                }>
                  <Select value={form.baseCalculo} onChange={v => set('baseCalculo', v)}
                    opcoes={[['liquido', 'Sobre o total já com desconto'], ['bruto', 'Sobre o total sem desconto']]} />
                </Campo>
                <Campo label="Arredondamento do crédito">
                  <Select value={form.arredondamento} onChange={v => set('arredondamento', v)}
                    opcoes={[['centavo', 'Ao centavo'], ['real', 'Ao real']]} />
                </Campo>
              </div>
            </Accordion>

            {/* Regras de Reativação */}
            <Accordion aberto={secao === 'reativacao'} onClick={() => setSecao(secao === 'reativacao' ? null : 'reativacao')}
              icon={Clock} titulo="Regras de Reativação">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600 inline-flex items-center gap-1">
                  Enviar aviso de reativação por WhatsApp
                  <InfoTip titulo="Reativação automática">
                    Com isto ligado, uma rotina diária procura clientes inativos com saldo
                    e envia o aviso dentro da faixa de horário configurada abaixo.
                  </InfoTip>
                </p>
                <Toggle on={form.reativacaoAtiva} onChange={v => set('reativacaoAtiva', v)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo label="Dias sem comprar p/ 1º aviso"><Input value={form.diasInatividade} onChange={e => set('diasInatividade', e.target.value)} inputMode="numeric" /></Campo>
                <Campo label="Saldo mínimo p/ avisar (R$)"><Input value={form.saldoMinimoAviso} onChange={e => set('saldoMinimoAviso', e.target.value)} inputMode="decimal" /></Campo>
                <div className="md:col-span-2 flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-600">Repetir aviso enquanto continuar inativo</span>
                  <Toggle on={form.repetirAviso} onChange={v => set('repetirAviso', v)} />
                </div>
                <Campo label="Intervalo entre repetições (dias)"><Input disabled={!form.repetirAviso} value={form.intervaloRepeticaoDias} onChange={e => set('intervaloRepeticaoDias', e.target.value)} inputMode="numeric" /></Campo>
                <Campo label={
                  <span className="inline-flex items-center gap-1">Máx. de avisos
                    <InfoTip titulo="Máximo de avisos">Zero significa sem limite de repetições.</InfoTip>
                  </span>
                }>
                  <Input disabled={!form.repetirAviso} value={form.maxAvisos} onChange={e => set('maxAvisos', e.target.value)} inputMode="numeric" />
                </Campo>
                <Campo label="Enviar a partir das (hora)"><Input value={form.horarioInicio} onChange={e => set('horarioInicio', e.target.value)} inputMode="numeric" /></Campo>
                <Campo label="Enviar até as (hora)"><Input value={form.horarioFim} onChange={e => set('horarioFim', e.target.value)} inputMode="numeric" /></Campo>
              </div>
            </Accordion>

            {/* WhatsApp (Meta) */}
            <Accordion aberto={secao === 'whatsapp'} onClick={() => setSecao(secao === 'whatsapp' ? null : 'whatsapp')}
              icon={MessageCircle} titulo="WhatsApp (Meta Cloud API)">
              {/* Condição real do servidor — continua visível */}
              {cfg && !cfg.encKeyConfigurada && (
                <Aviso tom="atencao" className="mb-4">
                  A chave <code>FIDELIDADE_ENC_KEY</code> não está configurada no servidor.
                  Sem ela não é possível salvar o token com segurança.
                </Aviso>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo label="Phone Number ID"><Input value={form.waPhoneNumberId} onChange={e => set('waPhoneNumberId', e.target.value)} /></Campo>
                <Campo label="WhatsApp Business Account ID"><Input value={form.waBusinessAccountId} onChange={e => set('waBusinessAccountId', e.target.value)} /></Campo>
                <Campo label={
                  <span className="inline-flex items-center gap-1">Nome do template aprovado
                    <InfoTip titulo="Formato exigido pela Meta">
                      O template precisa ter duas variáveis no corpo, nesta ordem:
                      a primeira é o nome do cliente, a segunda é o saldo (ex.: R$ 12,50).
                    </InfoTip>
                  </span>
                }>
                  <Input value={form.waTemplateNome} onChange={e => set('waTemplateNome', e.target.value)} placeholder="ex.: reativacao_cashback" />
                </Campo>
                <Campo label="Idioma do template"><Input value={form.waTemplateIdioma} onChange={e => set('waTemplateIdioma', e.target.value)} placeholder="pt_BR" /></Campo>
                <Campo label={
                  <span className="inline-flex items-center gap-1">Token da Meta
                    <InfoTip titulo="Token">
                      {cfg?.waTokenSet
                        ? 'Já existe um token salvo. Preencha apenas se quiser trocá-lo.'
                        : 'Cole aqui o token gerado no painel da Meta. Ele é guardado criptografado.'}
                    </InfoTip>
                  </span>
                }>
                  <Input type="password" value={novoToken} onChange={e => setNovoToken(e.target.value)}
                    placeholder={cfg?.waTokenSet ? '••••••••••••' : 'colar token'} />
                </Campo>
              </div>
            </Accordion>

            {/* Ativação & Geral */}
            <Accordion aberto={secao === 'geral'} onClick={() => setSecao(secao === 'geral' ? null : 'geral')}
              icon={ShieldCheck} titulo="Ativação & Geral">
              <div className="space-y-4">
                <Campo label={
                  <span className="inline-flex items-center gap-1">Mensagem padrão
                    <InfoTip titulo="Variáveis disponíveis">
                      Use <code>{'{nome}'}</code> para o nome do cliente e <code>{'{saldo}'}</code> para
                      o valor do cashback — o sistema substitui no envio.
                    </InfoTip>
                  </span>
                }>
                  <textarea value={form.mensagemPadrao} onChange={e => set('mensagemPadrao', e.target.value)}
                    rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                    placeholder="Oi {nome}! Você tem {saldo} de cashback esperando na loja. Volte e use!" />
                </Campo>
                <div className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-600 inline-flex items-center gap-1">
                    Exigir opt-in antes de avisar
                    <InfoTip titulo="Opt-in (LGPD)">
                      Só envia mensagem para clientes que autorizaram receber contato.
                      Recomendado manter ligado.
                    </InfoTip>
                  </span>
                  <Toggle on={form.exigeOptin} onChange={v => set('exigeOptin', v)} />
                </div>
              </div>
            </Accordion>

            {/* Salvar */}
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                {salvar.isPending ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
                {salvar.isPending ? 'Salvando...' : 'Salvar configuração'}
              </Button>
              {salvo && <span className="text-sm text-green-600">Salvo!</span>}
              {salvar.isError && <span className="text-sm text-red-600">{(salvar.error as any)?.message}</span>}
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ── Aba Visão Geral ────────────────────────────────────────────────────────────
function VisaoTab({ tenantSlug, programaAtivo, onIrConfig }: { tenantSlug: string; programaAtivo: boolean; onIrConfig: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['fidelidade-resumo', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/fidelidade/resumo`)).json(),
  })
  const r = data?.data

  if (isLoading) return <Carregando />

  const kpis = [
    { label: 'Saldo em circulação',   value: fmt(r?.saldoCirculante ?? 0), cor: 'text-green-600' },
    { label: 'Clientes com saldo',    value: String(r?.clientesComSaldo ?? 0), cor: 'text-gray-900' },
    { label: 'Creditado no mês',      value: fmt(r?.creditadoMes ?? 0), cor: 'text-green-600' },
    { label: 'Usado no mês',          value: fmt(r?.usadoMes ?? 0), cor: 'text-blue-600' },
    { label: 'Creditado (total)',     value: fmt(r?.creditadoTotal ?? 0), cor: 'text-gray-700' },
    { label: 'Usado (total)',         value: fmt(r?.usadoTotal ?? 0), cor: 'text-gray-700' },
    { label: 'Avisos WhatsApp (30d)', value: String(r?.avisos30d ?? 0), cor: 'text-gray-900' },
    { label: 'Erros de envio (30d)',  value: String(r?.erros30d ?? 0), cor: (r?.erros30d ?? 0) > 0 ? 'text-red-600' : 'text-gray-400' },
  ]

  return (
    <div className="space-y-4">
      {/* Estado real do sistema — continua visível */}
      {!programaAtivo && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-3">
          <p className="text-sm text-amber-700">O programa de cashback está <b>desativado</b>. Nenhum cashback está sendo gerado nas vendas.</p>
          <button onClick={onIrConfig} className="text-xs font-medium text-amber-700 underline whitespace-nowrap">Ativar</button>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">{k.label}</p>
            <p className={`text-xl font-bold mt-1 ${k.cor}`}>{k.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Aba Clientes & Saldo ───────────────────────────────────────────────────────
function ClientesTab({ tenantSlug }: { tenantSlug: string }) {
  const [busca, setBusca] = useState('')
  const [page, setPage]   = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['fidelidade-clientes', tenantSlug, busca, page],
    queryFn:  async () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' })
      if (busca) p.set('search', busca)
      return (await fetch(`/api/${tenantSlug}/fidelidade/clientes?${p}`)).json()
    },
  })
  const clientes = data?.data?.data ?? []
  const meta     = data?.data?.meta

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Buscar cliente..." value={busca} onChange={e => { setBusca(e.target.value); setPage(1) }} className="pl-9 h-9 text-sm" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Cliente</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Telefone</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Saldo</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">Ganho</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">Usado</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Última compra</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
            ) : clientes.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum cliente com saldo de cashback.</td></tr>
            ) : clientes.map((c: any) => (
              <tr key={c.clienteId} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.nome}</td>
                <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{c.telefone ?? '—'}</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-green-600">{fmt(c.saldo)}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-500 hidden lg:table-cell">{fmt(c.totalGanho)}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-500 hidden lg:table-cell">{fmt(c.totalUsado)}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-400 hidden md:table-cell">{fmtDataCurta(c.ultimaCompra)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">Página {meta.page} de {meta.totalPages} ({meta.total})</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Próximo</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Aba Movimentações ──────────────────────────────────────────────────────────
function MovimentosTab({ tenantSlug }: { tenantSlug: string }) {
  const [tipo, setTipo] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['fidelidade-movimentos', tenantSlug, tipo, page],
    queryFn:  async () => {
      const p = new URLSearchParams({ page: String(page), limit: '30' })
      if (tipo) p.set('tipo', tipo)
      return (await fetch(`/api/${tenantSlug}/fidelidade/movimentos?${p}`)).json()
    },
  })
  const movs = data?.data?.data ?? []
  const meta = data?.data?.meta

  const FILTROS = [
    { v: '', l: 'Todos' },
    { v: 'credito', l: 'Créditos' },
    { v: 'uso', l: 'Usos' },
    { v: 'estorno', l: 'Estornos' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {FILTROS.map(f => (
          <button key={f.v} onClick={() => { setTipo(f.v); setPage(1) }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tipo === f.v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {f.l}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Data</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Cliente</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Tipo</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Valor</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Obs.</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
            ) : movs.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Nenhuma movimentação.</td></tr>
            ) : movs.map((m: any) => {
              const cfg = TIPO_CFG[m.tipo] ?? { label: m.tipo, cls: 'bg-gray-100 text-gray-500', sinal: 1 }
              return (
                <tr key={m.movimentoId} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtData(m.createdDt)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.clienteNome}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span></td>
                  <td className={`px-4 py-3 text-right text-sm font-semibold ${cfg.sinal > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {cfg.sinal > 0 ? '+' : '-'}{fmt(m.valorCentavos)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">{m.observacao ?? (m.vendaId ? `Venda #${m.vendaId}` : '—')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">Página {meta.page} de {meta.totalPages} ({meta.total})</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Próximo</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Aba Reativação ─────────────────────────────────────────────────────────────
function ReativacaoTab({ tenantSlug, onIrConfig }: { tenantSlug: string; onIrConfig: () => void }) {
  const qc = useQueryClient()
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [msg, setMsg] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['fidelidade-reativacao', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/fidelidade/reativacao`)).json(),
  })
  const candidatos = data?.data?.candidatos ?? []
  const avisos     = data?.data?.ultimosAvisos ?? []
  const conf       = data?.data?.config

  const enviar = useMutation({
    mutationFn: async (clienteIds?: number[]) => {
      const res = await fetch(`/api/${tenantSlug}/fidelidade/reativacao`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clienteIds && clienteIds.length ? { clienteIds } : {}),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao enviar')
      return d?.data
    },
    onSuccess: (d) => {
      setMsg(`Enviados: ${d?.enviados ?? 0} · Erros: ${d?.erros ?? 0}`)
      setSel(new Set())
      qc.invalidateQueries({ queryKey: ['fidelidade-reativacao', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['fidelidade-resumo', tenantSlug] })
      setTimeout(() => refetch(), 500)
    },
    onError: (e: any) => setMsg(e?.message ?? 'Erro ao enviar'),
  })

  function toggle(id: number) {
    setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  if (isLoading) return <Carregando />

  return (
    <div className="space-y-4">
      {/* Status da config */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatusCard ok={conf?.programaAtivo} label="Programa" texto={conf?.programaAtivo ? 'Ativo' : 'Desativado'} onFix={!conf?.programaAtivo ? onIrConfig : undefined} />
        <StatusCard ok={conf?.reativacaoAtiva} label="Reativação automática" texto={conf?.reativacaoAtiva ? 'Ativa (cron diário)' : 'Desativada'} onFix={!conf?.reativacaoAtiva ? onIrConfig : undefined} />
        <StatusCard ok={conf?.waConfigurado} label="WhatsApp (Meta)" texto={conf?.waConfigurado ? 'Configurado' : 'Falta configurar'} onFix={!conf?.waConfigurado ? onIrConfig : undefined} />
      </div>

      {/* Candidatos */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700 inline-flex items-center gap-1">
            Elegíveis agora ({candidatos.length})
            <InfoTip titulo="Quem entra nesta lista">
              Clientes sem comprar há {conf?.diasInatividade ?? 30} dias ou mais e com saldo de
              cashback. O envio automático roda diariamente entre {conf?.horarioInicio ?? 9}h e
              {' '}{conf?.horarioFim ?? 20}h — aqui você pode disparar manualmente a qualquer hora.
            </InfoTip>
          </p>
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-gray-500">{msg}</span>}
            <Button size="sm" variant="outline" disabled={sel.size === 0 || enviar.isPending}
              onClick={() => enviar.mutate(Array.from(sel))}>
              <Send size={13} className="mr-1.5" /> Enviar selecionados
            </Button>
            <Button size="sm" disabled={candidatos.length === 0 || enviar.isPending}
              onClick={() => enviar.mutate(undefined)}>
              {enviar.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Send size={13} className="mr-1.5" />}
              Enviar para todos
            </Button>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="w-10 px-3 py-2"></th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-2">Cliente</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-2 hidden md:table-cell">Telefone</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-2">Saldo</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-2 hidden md:table-cell">Última compra</th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-2">Aviso nº</th>
            </tr>
          </thead>
          <tbody>
            {candidatos.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum cliente elegível no momento.</td></tr>
            ) : candidatos.map((c: any) => (
              <tr key={c.clienteId} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-2 text-center">
                  <input type="checkbox" checked={sel.has(c.clienteId)} onChange={() => toggle(c.clienteId)} className="w-4 h-4 rounded" />
                </td>
                <td className="px-4 py-2 text-sm font-medium text-gray-900">{c.nome}</td>
                <td className="px-4 py-2 text-sm text-gray-500 hidden md:table-cell">{c.telefone}</td>
                <td className="px-4 py-2 text-right text-sm font-semibold text-green-600">{fmt(c.saldo)}</td>
                <td className="px-4 py-2 text-right text-sm text-gray-400 hidden md:table-cell">{fmtDataCurta(c.ultimaCompra)}</td>
                <td className="px-4 py-2 text-center text-xs text-gray-500">{c.sequencia}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Últimos avisos */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Últimos envios</p>
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {avisos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhum aviso enviado ainda.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-2">Data</th>
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-2">Cliente</th>
                  <th className="text-right text-xs font-medium text-gray-400 px-4 py-2">Saldo no envio</th>
                  <th className="text-center text-xs font-medium text-gray-400 px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {avisos.map((a: any) => (
                  <tr key={a.avisoId} className="border-b border-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-500">{fmtData(a.enviadoEm ?? a.createdDt)}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{a.clienteNome}</td>
                    <td className="px-4 py-2 text-right text-sm text-gray-500">{fmt(a.saldo)}</td>
                    <td className="px-4 py-2 text-center">
                      {a.status === 'enviado'
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle size={12} /> Enviado</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-red-500" title={a.erroMsg ?? ''}><AlertTriangle size={12} /> Erro</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── componentes auxiliares ─────────────────────────────────────────────────────
function Carregando() {
  return <div className="flex items-center gap-2 text-sm text-gray-400 py-12 justify-center"><Loader2 size={16} className="animate-spin" /> Carregando...</div>
}

function StatusCard({ ok, label, texto, onFix }: { ok?: boolean; label: string; texto: string; onFix?: () => void }) {
  return (
    <div className={`rounded-xl border p-4 ${ok ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{label}</p>
        {ok ? <ArrowUpCircle size={15} className="text-green-500" /> : <ArrowDownCircle size={15} className="text-gray-400" />}
      </div>
      <p className={`text-sm font-semibold mt-1 ${ok ? 'text-green-700' : 'text-gray-600'}`}>{texto}</p>
      {onFix && <button onClick={onFix} className="text-xs text-blue-600 underline mt-1">Configurar</button>}
    </div>
  )
}

function Accordion({ aberto, onClick, icon: Icon, titulo, children }: any) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/50">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800"><Icon size={15} className="text-gray-400" /> {titulo}</span>
        {aberto ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>
      {aberto && <div className="px-4 pb-4 pt-1 border-t border-gray-50">{children}</div>}
    </div>
  )
}

function Campo({ label, children }: any) {
  return <div><Label className="text-xs text-gray-500">{label}</Label><div className="mt-1">{children}</div></div>
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} type="button"
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-green-500' : 'bg-gray-200'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function Select({ value, onChange, opcoes }: { value: string; onChange: (v: string) => void; opcoes: [string, string][] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
      {opcoes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}