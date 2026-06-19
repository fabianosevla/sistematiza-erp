'use client'
// components/modules/compras/CompraisView.tsx
//
// Shell do módulo Compras com as 6 etapas do fluxo Mogo:
// Requisição → MRP → Lista → Cotação → Pedido → Conferência

import { useState } from 'react'
import { Calculator, ClipboardList, ListChecks, Scale, ShoppingBag, PackageCheck } from 'lucide-react'
import MrpTab          from './MrpTab'
import RequisicoesTab   from './RequisicoesTab'
import ListasTab        from './ListasTab'
import CotacaoTab       from './CotacaoTab'
import PedidosTab       from './PedidosTab'
import ConferenciaTab   from './ConferenciaTab'

interface Props { tenantSlug: string }

type Aba = 'mrp' | 'requisicoes' | 'listas' | 'cotacao' | 'pedidos' | 'conferencia'

const ABAS: { key: Aba; label: string; icon: any }[] = [
  { key: 'mrp',          label: 'MRP',          icon: Calculator },
  { key: 'requisicoes',  label: 'Requisições',  icon: ClipboardList },
  { key: 'listas',       label: 'Listas',       icon: ListChecks },
  { key: 'cotacao',      label: 'Cotação',      icon: Scale },
  { key: 'pedidos',      label: 'Pedidos',      icon: ShoppingBag },
  { key: 'conferencia',  label: 'Conferência',  icon: PackageCheck },
]

export default function CompraisView({ tenantSlug }: Props) {
  const [aba, setAba]               = useState<Aba>('mrp')
  const [listaSelecionada, setListaSelecionada] = useState<number | null>(null)
  const [pedidoSelecionado, setPedidoSelecionado] = useState<number | null>(null)

  // Navegação entre abas com contexto (ex: "Iniciar Cotação" de uma lista
  // já leva pra aba Cotação com a lista pré-selecionada)
  function irParaCotacao(listaId: number) {
    setListaSelecionada(listaId)
    setAba('cotacao')
  }
  function irParaConferencia(pedidoId: number) {
    setPedidoSelecionado(pedidoId)
    setAba('conferencia')
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Compras</h1>
        <p className="text-sm text-gray-400 mt-0.5">Requisição → MRP → Lista → Cotação → Pedido → Conferência</p>
      </div>

      <div className="border-b border-gray-100 mb-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {ABAS.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a.key ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <a.icon size={14} />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {aba === 'mrp'         && <MrpTab tenantSlug={tenantSlug} onListaGerada={irParaCotacao} />}
      {aba === 'requisicoes' && <RequisicoesTab tenantSlug={tenantSlug} />}
      {aba === 'listas'      && <ListasTab tenantSlug={tenantSlug} onIniciarCotacao={irParaCotacao} />}
      {aba === 'cotacao'     && <CotacaoTab tenantSlug={tenantSlug} listaIdInicial={listaSelecionada} onPedidosGerados={() => setAba('pedidos')} />}
      {aba === 'pedidos'     && <PedidosTab tenantSlug={tenantSlug} onIniciarConferencia={irParaConferencia} />}
      {aba === 'conferencia' && <ConferenciaTab tenantSlug={tenantSlug} pedidoIdInicial={pedidoSelecionado} />}
    </div>
  )
}