'use client'
// components/modules/cardapio-digital/CardapioDigitalView.tsx
//
// Menu próprio do Cardápio Digital — antes vivia como uma seção dentro de
// Configurações (Header.tsx). Três abas: Layout (mensagem/cor — o logo é o
// mesmo já cadastrado em Configurações, não duplica upload aqui), Configurações
// (ativo, WhatsApp que recebe o pedido, tipos de venda permitidos) e QR Code
// (tela pronta pra imprimir: logo + QR embaixo).
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { Palette, Settings, QrCode as QrCodeIcon, Copy, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'

interface Props { tenantSlug: string }

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
          <div className="bg-white rounded-xl border border-gray-100 p-5 max-w-lg space-y-4">
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
