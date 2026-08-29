'use client'
// app/(dashboard)/[tenant]/pdv/PdvMesas.tsx
//
// Grade de mesas — uma mesa PODE TER MAIS DE UMA comanda aberta ao mesmo
// tempo (ex: dois grupos diferentes sentados na mesma mesa). Por isso cada
// número de mesa mostra QUANTAS comandas estão abertas nela, em vez de
// assumir uma relação 1-para-1.
//
// Usa exatamente a mesma API que o ComandasView real: GET/POST /comandas
//
// ─── O QUE MUDOU NO VISUAL ───────────────────────────────────────────────────
//
// A grade era um tabuleiro de quadrados de peso igual: mesa livre e mesa
// ocupada tinham a mesma presença, e o âmbar forte da ocupada fazia a tela
// inteira parecer em alerta. Agora:
//
//   • mesa LIVRE é quase invisível — hairline sobre o fundo, número em cinza
//     claro. É o estado padrão de metade das mesas; não precisa gritar.
//   • mesa OCUPADA é a única com preenchimento e com valor visível. O olho
//     vai direto para onde há dinheiro em aberto.
//   • os três números do topo (ocupadas, livres, em aberto) saíram do
//     subtítulo em texto corrido e viraram uma faixa igual à do dashboard.
//
// Nada de comportamento mudou: mesmo clique (ocupada abre comanda, livre abre
// o modal de nova), mesma sugestão de nome, mesmas mutations, mesmas 50 mesas.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Loader2, Users } from 'lucide-react'
import { FormModal } from '@/components/ui/FormModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt } from '@/lib/format'

interface Props {
  tenantSlug:     string
  onAbrirComanda: () => void
}

const TOTAL_MESAS = 50

// Extrai o número da mesa de identificações como "Mesa 5" ou "Mesa 5 - João"
function numeroDaMesa(identificacao: string): number | null {
  const m = identificacao.match(/^mesa\s+(\d+)/i)
  return m ? Number(m[1]) : null
}

export default function PdvMesas({ tenantSlug, onAbrirComanda }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()

  const [mesaSelecionada, setMesaSelecionada] = useState<number | null>(null)
  const [showNova, setShowNova]               = useState(false)
  const [identificacao, setIdentificacao]     = useState('')

  const { data: comandasRaw, isLoading } = useQuery({
    queryKey: ['pdv-mesas-comandas', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/comandas?status=aberta`)).json(),
    refetchInterval: 15000,
  })

  const novaComandaMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/${tenantSlug}/comandas`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ identificacao: id }),
      })
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pdv-mesas-comandas', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['comandas', tenantSlug] })
      setShowNova(false)
      setIdentificacao('')
      setMesaSelecionada(null)
      toast('Comanda aberta!')
      onAbrirComanda()
    },
    onError: () => toast('Erro ao abrir comanda.', 'error'),
  })

  // A API de comandas retorna { data: [...] } — mesmo formato usado pelo ComandasView real
  const comandas = Array.isArray(comandasRaw?.data) ? comandasRaw.data : []

  // Agrupa comandas abertas por número de mesa — uma mesa pode ter VÁRIAS
  const porMesa: Record<number, any[]> = {}
  const semMesa: any[] = []
  for (const c of comandas) {
    const num = numeroDaMesa(c.identificacao)
    if (num) {
      if (!porMesa[num]) porMesa[num] = []
      porMesa[num].push(c)
    } else {
      semMesa.push(c)
    }
  }

  const mesasOcupadas = Object.keys(porMesa).length
  const totalAberto   = comandas.reduce((a: number, c: any) => a + (c.total ?? 0), 0)

  function abrirModalNovaMesa(numero: number) {
    setMesaSelecionada(numero)
    const existentes = porMesa[numero]?.length ?? 0
    // Se já tem comanda nessa mesa, sugere um nome diferenciado para a nova
    setIdentificacao(existentes > 0 ? `Mesa ${numero} - ${existentes + 1}` : `Mesa ${numero}`)
    setShowNova(true)
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="text-[21px] font-semibold text-gray-900 tracking-tighter">Mesas</h1>
          <p className="text-[13px] text-gray-500 mt-1">Toque numa mesa livre para abrir comanda</p>
        </div>
        <Button
          variant="brand"
          className="h-9 px-4 text-sm"
          onClick={() => { setMesaSelecionada(null); setIdentificacao(''); setShowNova(true) }}
        >
          <Plus size={15} className="mr-1.5" /> Nova comanda
        </Button>
      </div>

      {/* Os três números que importam, na mesma faixa do dashboard. */}
      <div className="flex bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-4">
        <div className="flex-1 px-[18px] py-3 border-r border-gray-100">
          <p className="text-[11px] font-medium text-gray-500">Ocupadas</p>
          <p className="text-[20px] font-semibold text-gray-900 tracking-tighter mt-1.5">
            {isLoading ? '—' : mesasOcupadas}
          </p>
        </div>
        <div className="flex-1 px-[18px] py-3 border-r border-gray-100">
          <p className="text-[11px] font-medium text-gray-500">Livres</p>
          <p className="text-[20px] font-semibold text-gray-900 tracking-tighter mt-1.5">
            {isLoading ? '—' : TOTAL_MESAS - mesasOcupadas}
          </p>
        </div>
        <div className="flex-1 px-[18px] py-3">
          <p className="text-[11px] font-medium text-gray-500">Em aberto</p>
          <p className="text-[20px] font-semibold text-gray-900 tracking-tighter mt-1.5">
            {isLoading ? '—' : fmt(totalAberto)}
          </p>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-5 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-md bg-white border border-gray-200" />
          <span className="text-[11.5px] text-gray-500">Livre</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-md bg-amber-50 border border-amber-200" />
          <span className="text-[11.5px] text-gray-500">Ocupada</span>
        </div>
        <div className="flex items-center gap-2">
          <Users size={12} className="text-amber-500" />
          <span className="text-[11.5px] text-gray-500">Mais de uma comanda na mesa</span>
        </div>
      </div>

      {/* Grade de mesas.
          Mesa livre fica de propósito discreta: são dezenas delas e nenhuma
          pede ação. O preenchimento âmbar marca só as que têm conta aberta. */}
      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
        {Array.from({ length: TOTAL_MESAS }, (_, i) => i + 1).map(num => {
          const comandasMesa = porMesa[num] ?? []
          const ocupada      = comandasMesa.length > 0
          const totalMesa    = comandasMesa.reduce((a, c) => a + (c.total ?? 0), 0)

          return (
            <button
              key={num}
              onClick={() => (ocupada ? onAbrirComanda() : abrirModalNovaMesa(num))}
              title={ocupada
                ? `Mesa ${num} · ${comandasMesa.length} comanda(s) · ${fmt(totalMesa)}`
                : `Mesa ${num} · livre`}
              className={`
                aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5
                border relative transition-colors active:scale-[0.97]
                ${ocupada
                  ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                  : 'bg-white border-gray-200 text-gray-400 hover:border-green-300 hover:text-green-800 hover:bg-green-50'
                }
              `}
            >
              {comandasMesa.length > 1 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-semibold flex items-center justify-center">
                  {comandasMesa.length}
                </span>
              )}
              <span className={`text-[17px] tracking-tight ${ocupada ? 'font-semibold' : 'font-medium'}`}>
                {num}
              </span>
              {ocupada && totalMesa > 0 && (
                <span className="text-[9.5px] font-medium text-amber-700 leading-none tabular">
                  {fmt(totalMesa)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Comandas sem número de mesa (balcão, nome do cliente, etc.) */}
      {semMesa.length > 0 && (
        <div className="mt-7">
          <p className="text-[12.5px] font-medium text-gray-600 mb-2.5">Outras comandas abertas</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {semMesa.map((c: any) => (
              <button
                key={c.comandaId}
                onClick={onAbrirComanda}
                className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-amber-200 hover:bg-amber-50/40 transition-colors"
              >
                <p className="text-[13.5px] font-medium text-gray-900 truncate">{c.identificacao}</p>
                <p className="text-[17px] font-semibold tracking-tight text-gray-900 mt-1 tabular">{fmt(c.total)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Painel nova comanda */}
      {showNova && (
        <FormModal
          titulo={mesaSelecionada ? `Nova comanda — Mesa ${mesaSelecionada}` : 'Nova comanda'}
          onClose={() => setShowNova(false)}
          largura="max-w-sm"
        >
            <div className="p-6 space-y-4">
              {mesaSelecionada && (porMesa[mesaSelecionada]?.length ?? 0) > 0 && (
                <p className="text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  Esta mesa já tem {porMesa[mesaSelecionada].length} comanda(s) aberta(s). Esta será mais uma.
                </p>
              )}
              <div>
                <Label>Identificação *</Label>
                <Input
                  value={identificacao}
                  onChange={e => setIdentificacao(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && identificacao && novaComandaMut.mutate(identificacao)}
                  className="mt-1.5 h-10 text-sm"
                  placeholder="Ex: Mesa 5, Balcão, João..."
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" className="h-9 px-4" onClick={() => setShowNova(false)}>Cancelar</Button>
                <Button
                  variant="brand"
                  className="h-9 px-4"
                  onClick={() => novaComandaMut.mutate(identificacao)}
                  disabled={!identificacao || novaComandaMut.isPending}
                >
                  {novaComandaMut.isPending
                    ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Abrindo...</>
                    : 'Abrir comanda'
                  }
                </Button>
              </div>
            </div>
        </FormModal>
      )}
    </div>
  )
}
