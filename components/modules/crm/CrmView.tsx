'use client'
// components/modules/crm/CrmView.tsx
//
// CRM — módulo novo (13/09/2026). Absorve a Fidelidade (cashback/indique-e-
// ganhe/reativação), que passa a ser uma aba aqui em vez de item de menu
// próprio — zero mudança na lógica dela, só de endereço.
import { useState } from 'react'
import { Handshake, Users, Gift, Radar, Megaphone, QrCode } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import FidelidadeView from '@/components/modules/fidelidade/FidelidadeView'
import ClientesTab from './ClientesTab'
import SegmentacaoTab from './SegmentacaoTab'
import FunilB2bTab from './FunilB2bTab'
import CampanhasTab from './CampanhasTab'
import CardapioAnaliseTab from './CardapioAnaliseTab'

interface Props { tenantSlug: string }

// "Visão Geral" e "Clientes" eram duas abas separadas e viraram uma só
// (13/09/2026) — ver comentário no topo de ClientesTab.tsx.
type Aba = 'clientes' | 'fidelidade' | 'segmentacao' | 'funil' | 'campanhas' | 'cardapio'

const ABAS: { key: Aba; label: string; icon: any }[] = [
  { key: 'clientes',     label: 'Clientes',     icon: Users },
  { key: 'fidelidade',   label: 'Fidelidade',   icon: Gift },
  { key: 'segmentacao',  label: 'Segmentação',  icon: Radar },
  { key: 'funil',        label: 'Funil B2B',    icon: Handshake },
  { key: 'campanhas',    label: 'Campanhas',    icon: Megaphone },
  { key: 'cardapio',     label: 'Cardápio Digital', icon: QrCode },
]

export default function CrmView({ tenantSlug }: Props) {
  const [aba, setAba] = useState<Aba>('clientes')

  return (
    <div>
      <PageHeader titulo="CRM" />

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

      {aba === 'clientes'    && <ClientesTab tenantSlug={tenantSlug} />}
      {aba === 'fidelidade'  && <FidelidadeView tenantSlug={tenantSlug} semTitulo />}
      {aba === 'segmentacao' && <SegmentacaoTab tenantSlug={tenantSlug} />}
      {aba === 'funil'       && <FunilB2bTab tenantSlug={tenantSlug} />}
      {aba === 'campanhas'   && <CampanhasTab tenantSlug={tenantSlug} />}
      {aba === 'cardapio'    && <CardapioAnaliseTab tenantSlug={tenantSlug} />}
    </div>
  )
}
