'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Gift, ChevronDown, ChevronRight, Save, MessageCircle, Percent, Clock,
  Settings, Users, Receipt, Bell, ShieldCheck, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props { tenantSlug: string }

type Aba = 'visao' | 'clientes' | 'movimentacoes' | 'reativacao' | 'config'
type Secao = 'cashback' | 'reativacao' | 'whatsapp' | 'geral'

// ── conversões (a API trabalha em centavos e basis points) ─────────────────────
const bpToPct  = (bp: number) => (Number(bp || 0) / 100)
const pctToBp  = (p: any)     => Math.round(parseFloat(String(p).replace(',', '.') || '0') * 100)
const centToBRL = (c: number) => (Number(c || 0) / 100).toFixed(2)
const brlToCent = (v: any)    => Math.round(parseFloat(String(v).replace(',', '.') || '0') * 100)

export default function FidelidadeView({ tenantSlug }: Props) {
  const qc = useQueryClient()
  const [aba, setAba]     = useState<Aba>('config')
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
    { key: 'visao',          label: 'Visão Geral',     icon: Gift },
    { key: 'clientes',       label: 'Clientes & Saldo', icon: Users },
    { key: 'movimentacoes',  label: 'Movimentações',   icon: Receipt },
    { key: 'reativacao',     label: 'Reativação',      icon: Bell },
    { key: 'config',         label: 'Configuração',    icon: Settings },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Gift size={22} className="text-green-600" /> Fidelidade
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Cashback e reativação de clientes por WhatsApp</p>
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
              <div>
                <p className="text-sm font-semibold text-gray-900">Programa ativo</p>
                <p className="text-xs text-gray-400">Liga/desliga o cashback sem apagar nenhum dado.</p>
              </div>
              <Toggle on={form.programaAtivo} onChange={v => set('programaAtivo', v)} />
            </div>

            {/* Regras de Cashback */}
            <Accordion aberto={secao === 'cashback'} onClick={() => setSecao(secao === 'cashback' ? null : 'cashback')}
              icon={Percent} titulo="Regras de Cashback">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo label="Cashback por venda (%)"><Input value={form.cashbackPct} onChange={e => set('cashbackPct', e.target.value)} inputMode="decimal" /></Campo>
                <Campo label="Compra mínima p/ gerar (R$)"><Input value={form.compraMinima} onChange={e => set('compraMinima', e.target.value)} inputMode="decimal" /></Campo>
                <Campo label="Validade do cashback (dias, 0 = não expira)"><Input value={form.validadeDias} onChange={e => set('validadeDias', e.target.value)} inputMode="numeric" /></Campo>
                <Campo label="Limite de uso por compra (% da venda)"><Input value={form.limiteUsoPct} onChange={e => set('limiteUsoPct', e.target.value)} inputMode="decimal" /></Campo>
                <Campo label="Saldo mínimo p/ usar (R$)"><Input value={form.saldoMinimoUso} onChange={e => set('saldoMinimoUso', e.target.value)} inputMode="decimal" /></Campo>
                <Campo label="Base de cálculo">
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
                <p className="text-sm text-gray-600">Enviar aviso de reativação por WhatsApp</p>
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
                <Campo label="Máx. de avisos (0 = ilimitado)"><Input disabled={!form.repetirAviso} value={form.maxAvisos} onChange={e => set('maxAvisos', e.target.value)} inputMode="numeric" /></Campo>
                <Campo label="Enviar a partir das (hora)"><Input value={form.horarioInicio} onChange={e => set('horarioInicio', e.target.value)} inputMode="numeric" /></Campo>
                <Campo label="Enviar até as (hora)"><Input value={form.horarioFim} onChange={e => set('horarioFim', e.target.value)} inputMode="numeric" /></Campo>
              </div>
            </Accordion>

            {/* WhatsApp (Meta) */}
            <Accordion aberto={secao === 'whatsapp'} onClick={() => setSecao(secao === 'whatsapp' ? null : 'whatsapp')}
              icon={MessageCircle} titulo="WhatsApp (Meta Cloud API)">
              {cfg && !cfg.encKeyConfigurada && (
                <div className="mb-4 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg p-3">
                  A chave <code>FIDELIDADE_ENC_KEY</code> não está configurada no servidor. Sem ela não é possível salvar o token com segurança.
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo label="Phone Number ID"><Input value={form.waPhoneNumberId} onChange={e => set('waPhoneNumberId', e.target.value)} /></Campo>
                <Campo label="WhatsApp Business Account ID"><Input value={form.waBusinessAccountId} onChange={e => set('waBusinessAccountId', e.target.value)} /></Campo>
                <Campo label="Nome do template aprovado"><Input value={form.waTemplateNome} onChange={e => set('waTemplateNome', e.target.value)} placeholder="ex.: reativacao_cashback" /></Campo>
                <Campo label="Idioma do template"><Input value={form.waTemplateIdioma} onChange={e => set('waTemplateIdioma', e.target.value)} placeholder="pt_BR" /></Campo>
                <Campo label={`Token da Meta ${cfg?.waTokenSet ? '(configurado — preencha só p/ trocar)' : ''}`}>
                  <Input type="password" value={novoToken} onChange={e => setNovoToken(e.target.value)}
                    placeholder={cfg?.waTokenSet ? '••••••••••••' : 'colar token'} />
                </Campo>
              </div>
            </Accordion>

            {/* Ativação & Geral */}
            <Accordion aberto={secao === 'geral'} onClick={() => setSecao(secao === 'geral' ? null : 'geral')}
              icon={ShieldCheck} titulo="Ativação & Geral">
              <div className="space-y-4">
                <Campo label="Mensagem padrão (usa {nome} e {saldo})">
                  <textarea value={form.mensagemPadrao} onChange={e => set('mensagemPadrao', e.target.value)}
                    rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
                    placeholder="Oi {nome}! Você tem {saldo} de cashback esperando na loja. Volte e use!" />
                </Campo>
                <div className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-600">Exigir opt-in (consentimento LGPD) antes de avisar</span>
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

      {/* ── Abas ainda em construção (Fases 2-4) ──────────────────────────── */}
      {aba !== 'config' && (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
          <p className="text-sm text-gray-500">Esta seção entra nas próximas fases do módulo.</p>
          <p className="text-xs text-gray-400 mt-1">A base (configuração) já está pronta.</p>
        </div>
      )}
    </div>
  )
}

// ── componentes auxiliares ─────────────────────────────────────────────────────
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