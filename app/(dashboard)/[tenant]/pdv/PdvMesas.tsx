'use client'
// app/(dashboard)/[tenant]/pdv/PdvMesas.tsx
//
// Grade de mesas — uma mesa PODE TER MAIS DE UMA comanda aberta ao mesmo
// tempo (ex: dois grupos diferentes sentados na mesma mesa). Por isso cada
// número de mesa mostra QUANTAS comandas estão abertas nela, em vez de
// assumir uma relação 1-para-1.
//
// Usa exatamente a mesma API que o ComandasView real: GET/POST /comandas

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Loader2, Users } from 'lucide-react'
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Mesas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {isLoading
              ? 'Carregando...'
              : `${mesasOcupadas} mesa(s) ocupada(s) · ${TOTAL_MESAS - mesasOcupadas} livre(s) · ${fmt(totalAberto)} em aberto`}
          </p>
        </div>
        <Button onClick={() => { setMesaSelecionada(null); setIdentificacao(''); setShowNova(true) }}>
          <Plus size={14} className="mr-1.5" /> Nova comanda
        </Button>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-lg bg-white border border-gray-200" />
          <span className="text-xs text-gray-500">Livre</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-lg bg-amber-100 border border-amber-300" />
          <span className="text-xs text-gray-500">Ocupada</span>
        </div>
        <div className="flex items-center gap-2">
          <Users size={13} className="text-amber-500" />
          <span className="text-xs text-gray-500">Mais de uma comanda na mesa</span>
        </div>
      </div>

      {/* Grid de mesas */}
      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
        {Array.from({ length: TOTAL_MESAS }, (_, i) => i + 1).map(num => {
          const comandasMesa = porMesa[num] ?? []
          const ocupada      = comandasMesa.length > 0
          const totalMesa    = comandasMesa.reduce((a, c) => a + (c.total ?? 0), 0)

          return (
            <button
              key={num}
              onClick={() => (ocupada ? onAbrirComanda() : abrirModalNovaMesa(num))}
              className={`
                aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5
                text-sm font-bold transition-all active:scale-95 border relative
                ${ocupada
                  ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-700 hover:bg-green-50'
                }
              `}
            >
              {comandasMesa.length > 1 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {comandasMesa.length}
                </span>
              )}
              <span className="text-base font-bold">{num}</span>
              {ocupada && totalMesa > 0 && (
                <span className="text-[9px] font-normal text-amber-600 leading-none">
                  {fmt(totalMesa)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Comandas sem número de mesa (balcão, nome do cliente, etc.) */}
      {semMesa.length > 0 && (
        <div className="mt-8">
          <p className="text-sm font-semibold text-gray-700 mb-3">Outras comandas abertas</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {semMesa.map((c: any) => (
              <button
                key={c.comandaId}
                onClick={onAbrirComanda}
                className="bg-white rounded-xl border border-amber-200 p-4 text-left hover:border-amber-300 hover:shadow-sm transition-all"
              >
                <p className="text-sm font-semibold text-gray-900">{c.identificacao}</p>
                <p className="text-base font-bold mt-1" style={{ color: '#2ecc71' }}>{fmt(c.total)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal nova comanda */}
      {showNova && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">
                {mesaSelecionada ? `Nova comanda — Mesa ${mesaSelecionada}` : 'Nova comanda'}
              </h2>
              <button onClick={() => setShowNova(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {mesaSelecionada && (porMesa[mesaSelecionada]?.length ?? 0) > 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Esta mesa já tem {porMesa[mesaSelecionada].length} comanda(s) aberta(s). Esta será mais uma.
                </p>
              )}
              <div>
                <Label>Identificação *</Label>
                <Input
                  value={identificacao}
                  onChange={e => setIdentificacao(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && identificacao && novaComandaMut.mutate(identificacao)}
                  className="mt-1"
                  placeholder="Ex: Mesa 5, Balcão, João..."
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">Mesa, número ou nome do cliente</p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowNova(false)}>Cancelar</Button>
                <Button
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
          </div>
        </div>
      )}
    </div>
  )
}