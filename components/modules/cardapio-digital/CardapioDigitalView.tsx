'use client'
// components/modules/cardapio-digital/CardapioDigitalView.tsx
//
// Menu próprio do Cardápio Digital — antes vivia como uma seção dentro de
// Configurações (Header.tsx). Três abas: Layout (mensagem/cor — o logo é o
// mesmo já cadastrado em Configurações, não duplica upload aqui), Configurações
// (ativo, WhatsApp que recebe o pedido, tipos de venda permitidos) e QR Code
// (tela pronta pra imprimir: logo + QR embaixo).
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { Palette, Settings, QrCode as QrCodeIcon, Copy, Printer, Upload, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'

interface Props { tenantSlug: string }

const DIAS_SEMANA = [
  ['dom', 'Domingo'], ['seg', 'Segunda'], ['ter', 'Terça'], ['qua', 'Quarta'],
  ['qui', 'Quinta'], ['sex', 'Sexta'], ['sab', 'Sábado'],
] as const
const DIA_PADRAO = { aberto: true, abre: '08:00', fecha: '18:00' }

const LAYOUTS = [
  { id: 'classico',  nome: 'Clássico',  descricao: 'Lista com foto pequena ao lado de cada produto.' },
  { id: 'grade',      nome: 'Grade',     descricao: 'Cards em grade, foto grande em cima do nome/preço.' },
  { id: 'capa',       nome: 'Capa',      descricao: 'Foto de fundo grande no topo, com o cardápio abaixo.' },
  { id: 'compacto',   nome: 'Compacto',  descricao: 'Lista densa, sem foto — ótimo pra cardápio com muitos itens.' },
] as const

/** Miniatura ilustrativa de cada layout — não é screenshot, é só um esquema. */
function MockupLayout({ tipo }: { tipo: string }) {
  const base = 'w-full rounded bg-gray-100'
  if (tipo === 'grade') {
    return (
      <div className="space-y-1.5">
        <div className={`${base} h-3`} />
        <div className="grid grid-cols-2 gap-1.5">
          <div className="bg-gray-200 rounded h-8" />
          <div className="bg-gray-200 rounded h-8" />
          <div className="bg-gray-200 rounded h-8" />
          <div className="bg-gray-200 rounded h-8" />
        </div>
      </div>
    )
  }
  if (tipo === 'capa') {
    return (
      <div className="space-y-1.5">
        <div className="bg-gray-300 rounded h-10" />
        <div className={`${base} h-2.5`} />
        <div className={`${base} h-2.5`} />
        <div className={`${base} h-2.5`} />
      </div>
    )
  }
  if (tipo === 'compacto') {
    return (
      <div className="space-y-1">
        <div className={`${base} h-2.5`} />
        {[...Array(6)].map((_, i) => <div key={i} className="bg-gray-100 rounded h-1.5" />)}
      </div>
    )
  }
  // classico
  return (
    <div className="space-y-1.5">
      <div className={`${base} h-3`} />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="bg-gray-200 rounded w-4 h-4 flex-shrink-0" />
          <div className="bg-gray-100 rounded h-2 flex-1" />
        </div>
      ))}
    </div>
  )
}

export default function CardapioDigitalView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/cardapio/config`

  const [aba, setAba] = useState<'layout' | 'config' | 'qrcode'>('layout')

  const { data: cfgRaw } = useQuery({
    queryKey: ['cardapio-config', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
  })
  const { data: empresaRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
  })

  const cfg     = cfgRaw?.data
  const empresa = empresaRaw?.data

  const [local, setLocal] = useState<any>(null)
  useEffect(() => { if (cfg && !local) setLocal(cfg) }, [cfg])

  function set(campo: string, valor: any) {
    setLocal((prev: any) => ({ ...(prev ?? {}), [campo]: valor }))
  }

  function setDia(dia: string, campo: 'aberto' | 'abre' | 'fecha', valor: any) {
    setLocal((prev: any) => ({
      ...(prev ?? {}),
      horario: {
        ...(prev?.horario ?? {}),
        [dia]: { ...DIA_PADRAO, ...(prev?.horario?.[dia] ?? {}), [campo]: valor },
      },
    }))
  }

  const salvarMut = useMutation({
    mutationFn: () => fetch(api, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(local),
    }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cardapio-config', tenantSlug] }); toast('Salvo!') },
    onError:   () => toast('Erro ao salvar.', 'error'),
  })

  // Link + QR Code do cardápio público — mesma lógica que existia em Header.tsx.
  const [urlCardapio, setUrlCardapio] = useState('')
  const [qrDataUrl, setQrDataUrl]     = useState('')
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = `${window.location.origin}/cardapio/${tenantSlug}`
    setUrlCardapio(url)
    QRCode.toDataURL(url, { width: 480, margin: 1 }).then(setQrDataUrl).catch(() => {})
  }, [tenantSlug])

  function copiarLink() {
    navigator.clipboard?.writeText(urlCardapio)
    toast('Link copiado!')
  }

  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [enviandoBanner, setEnviandoBanner] = useState(false)

  async function enviarBanner(file: File) {
    if (file.size > 5 * 1024 * 1024) { toast('Imagem acima de 5 MB. Escolha uma menor.', 'error'); return }
    setEnviandoBanner(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch(`/api/${tenantSlug}/cardapio/banner`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao enviar imagem')
      set('bannerUrl', data.data.bannerUrl)
      qc.invalidateQueries({ queryKey: ['cardapio-config', tenantSlug] })
      toast('Foto de fundo atualizada!')
    } catch (e: any) {
      toast(e?.message ?? 'Não foi possível enviar a imagem.', 'error')
    } finally {
      setEnviandoBanner(false)
    }
  }

  async function removerBanner() {
    setEnviandoBanner(true)
    try {
      const res  = await fetch(`/api/${tenantSlug}/cardapio/banner`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message ?? 'Erro ao remover imagem')
      set('bannerUrl', null)
      qc.invalidateQueries({ queryKey: ['cardapio-config', tenantSlug] })
      toast('Foto de fundo removida!')
    } catch (e: any) {
      toast(e?.message ?? 'Não foi possível remover a imagem.', 'error')
    } finally {
      setEnviandoBanner(false)
    }
  }

  if (!local) {
    return <div className="text-center py-12 text-sm text-gray-400">Carregando...</div>
  }

  return (
    <div>
      {/* A tela inteira some da impressão — só o pôster (mais abaixo) aparece. */}
      <div className="print:hidden">
        <PageHeader
          titulo="Cardápio Digital"
          subtitulo="Página pública de pedidos, sem login — o cliente acessa pelo link ou QR Code."
        />

        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
          {([
            { value: 'layout', label: 'Layout',       icon: Palette },
            { value: 'config', label: 'Configurações', icon: Settings },
            { value: 'qrcode', label: 'QR Code',       icon: QrCodeIcon },
          ] as const).map(a => (
            <button key={a.value} onClick={() => setAba(a.value)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${aba === a.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <a.icon size={14} /> {a.label}
            </button>
          ))}
        </div>

        {/* ABA: LAYOUT */}
        {aba === 'layout' && (
          <div className="space-y-4 max-w-2xl">
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">Disposição da tela</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {LAYOUTS.map(l => {
                  const selecionado = (local.layout ?? 'classico') === l.id
                  return (
                    <button key={l.id} onClick={() => set('layout', l.id)}
                      className={`text-left rounded-xl border-2 p-3 transition-colors ${selecionado ? 'border-green-500 bg-green-50/40' : 'border-gray-100 hover:border-gray-200'}`}>
                      <div className="mb-2"><MockupLayout tipo={l.id} /></div>
                      <p className="text-xs font-semibold text-gray-800 inline-flex items-center gap-1">
                        {l.nome} {selecionado && <Check size={12} className="text-green-600" />}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{l.descricao}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
              <div>
                <Label className="inline-flex items-center gap-1">
                  Foto de fundo / capa
                  <InfoTip titulo="Onde aparece">Usada como fundo no topo do cardápio — mais evidente no layout Capa.</InfoTip>
                </Label>
                <div className="flex items-center gap-3 mt-2">
                  {local.bannerUrl ? (
                    <div className="relative">
                      <img src={local.bannerUrl} alt="" className="w-24 h-14 rounded-lg object-cover border border-gray-100" />
                      <button type="button" onClick={removerBanner} disabled={enviandoBanner}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-200">
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-14 rounded-lg bg-gray-100" />
                  )}
                  <input ref={bannerInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) enviarBanner(f) }} />
                  <Button variant="outline" size="sm" onClick={() => bannerInputRef.current?.click()} disabled={enviandoBanner}>
                    <Upload size={13} className="mr-1.5" /> {enviandoBanner ? 'Enviando...' : 'Trocar imagem'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <InfoTip titulo="Logo">
              O logo mostrado no cardápio é o mesmo já cadastrado em Configurações — não precisa subir de novo aqui.
            </InfoTip>
            <div>
              <Label className="inline-flex items-center gap-1">
                Mensagem de boas-vindas
                <InfoTip titulo="Onde aparece">Texto mostrado no topo do cardápio, abaixo do nome da empresa.</InfoTip>
              </Label>
              <Input value={local.mensagemBoasVindas ?? ''} onChange={e => set('mensagemBoasVindas', e.target.value)}
                className="mt-1" placeholder="Ex: Peça já sua massa fresquinha!" maxLength={300} />
            </div>
            <div>
              <Label className="inline-flex items-center gap-1">
                Cor de destaque
                <InfoTip titulo="Onde aparece">Cor dos botões e destaques do cardápio.</InfoTip>
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" value={local.corDestaque ?? '#2ecc71'} onChange={e => set('corDestaque', e.target.value)}
                  className="w-9 h-9 rounded border border-gray-200 cursor-pointer" />
                <Input value={local.corDestaque ?? '#2ecc71'} onChange={e => set('corDestaque', e.target.value)} className="flex-1" />
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <Button onClick={() => salvarMut.mutate()} disabled={salvarMut.isPending}>{salvarMut.isPending ? 'Salvando...' : 'Salvar'}</Button>
            </div>
            </div>
          </div>
        )}

        {/* ABA: CONFIGURAÇÕES */}
        {aba === 'config' && (
          <div className="bg-white rounded-xl border border-gray-100 p-5 max-w-lg space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-700 inline-flex items-center gap-1">
                Cardápio ativo
                <InfoTip titulo="O que isso faz">Liga ou desliga o link público — desligado, ninguém acessa.</InfoTip>
              </span>
              <button onClick={() => set('cardapioAtivo', !local.cardapioAtivo)}
                className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${local.cardapioAtivo ? 'bg-green-500' : 'bg-gray-200'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${local.cardapioAtivo ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            <div>
              <Label className="inline-flex items-center gap-1">
                WhatsApp para receber pedidos
                <InfoTip titulo="Formato">Com DDD, ex: (35) 99999-9999. É pra esse número que a mensagem do pedido vai.</InfoTip>
              </Label>
              <Input value={local.whatsapp ?? ''} onChange={e => set('whatsapp', e.target.value)}
                className="mt-1" placeholder="(35) 99999-9999" />
            </div>

            <div>
              <p className="text-sm text-gray-700 mb-2">Tipos de venda permitidos</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={local.permiteEntrega ?? true} onChange={e => set('permiteEntrega', e.target.checked)} className="w-4 h-4 rounded" />
                  Entrega
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={local.permiteBalcao ?? true} onChange={e => set('permiteBalcao', e.target.checked)} className="w-4 h-4 rounded" />
                  Retirada no balcão
                </label>
              </div>
            </div>

            {local.permiteEntrega && (
              <div>
                <Label className="inline-flex items-center gap-1">
                  Taxa de entrega (R$)
                  <InfoTip titulo="Taxa de entrega">Somada automaticamente ao pedido quando o cliente escolhe entrega. Deixe 0,00 para não cobrar taxa.</InfoTip>
                </Label>
                <Input type="number" min="0" step="0.01" inputMode="decimal"
                  value={((local.taxaEntrega ?? 0) / 100).toFixed(2)}
                  onChange={e => set('taxaEntrega', Math.round(parseFloat(e.target.value.replace(',', '.') || '0') * 100))}
                  className="sem-spinner mt-1 max-w-[160px]" />
              </div>
            )}

            <div>
              <Label className="inline-flex items-center gap-1">
                Horário de atendimento
                <InfoTip titulo="Horário de atendimento">Fora do horário marcado, o cardápio avisa que está fechado e não deixa fazer pedido. Sem nenhum dia marcado, fica sempre aberto.</InfoTip>
              </Label>
              <div className="mt-2 space-y-2">
                {DIAS_SEMANA.map(([chave, nome]) => {
                  const diaCfg = local.horario?.[chave] ?? { ...DIA_PADRAO, aberto: false }
                  return (
                    <div key={chave} className="flex items-center gap-3">
                      <label className="flex items-center gap-2 w-28 text-sm text-gray-600 cursor-pointer flex-shrink-0">
                        <input type="checkbox" checked={diaCfg.aberto} onChange={e => setDia(chave, 'aberto', e.target.checked)} className="w-4 h-4 rounded" />
                        {nome}
                      </label>
                      {diaCfg.aberto ? (
                        <div className="flex items-center gap-2">
                          <Input type="time" value={diaCfg.abre} onChange={e => setDia(chave, 'abre', e.target.value)} className="h-8 w-28 text-sm" />
                          <span className="text-gray-400 text-sm">até</span>
                          <Input type="time" value={diaCfg.fecha} onChange={e => setDia(chave, 'fecha', e.target.value)} className="h-8 w-28 text-sm" />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Fechado</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <Button onClick={() => salvarMut.mutate()} disabled={salvarMut.isPending}>{salvarMut.isPending ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        )}

        {/* ABA: QR CODE */}
        {aba === 'qrcode' && (
          <div className="space-y-4 max-w-lg">
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Input readOnly value={urlCardapio} className="text-xs h-9" />
                <Button variant="outline" size="sm" onClick={copiarLink}>
                  <Copy size={13} className="mr-1.5" /> Copiar
                </Button>
              </div>
              <Button className="w-full" onClick={() => window.print()}>
                <Printer size={14} className="mr-1.5" /> Imprimir cartaz com QR Code
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* PÔSTER — só aparece na impressão (ver @media print no print:hidden acima) */}
      <div className="hidden print:flex print:flex-col print:items-center print:justify-center print:h-screen print:w-full text-center gap-6">
        {empresa?.logoBase64 && <img src={empresa.logoBase64} alt="" style={{ maxHeight: 160, maxWidth: 320, objectFit: 'contain' }} />}
        <h1 style={{ fontSize: 32, fontWeight: 700 }}>{empresa?.nomeFantasia || empresa?.nomeEmpresa}</h1>
        <p style={{ fontSize: 18, color: '#555' }}>Aponte a câmera do celular para ver o cardápio e fazer seu pedido</p>
        {qrDataUrl && <img src={qrDataUrl} alt="QR Code do cardápio" style={{ width: 320, height: 320 }} />}
        <p style={{ fontSize: 14, color: '#999' }}>{urlCardapio}</p>
      </div>
    </div>
  )
}
