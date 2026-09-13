'use client'
// components/modules/crm/CrmView.tsx
//
// CRM — módulo novo (13/09/2026). Absorve a Fidelidade (cashback/indique-e-
// ganhe/reativação), que passa a ser uma aba aqui em vez de item de menu
// próprio — zero mudança na lógica dela, só de endereço.
import { useState } from 'react'
import { Handshake, Users, TrendingUp, Gift, Radar, Megaphone, QrCode } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import FidelidadeView from '@/components/modules/fidelidade/FidelidadeView'
import VisaoGeralTab from './VisaoGeralTab'
import Ficha360Busca from './Ficha360Busca'
import SegmentacaoTab from './SegmentacaoTab'
import FunilB2bTab from './FunilB2bTab'
import CampanhasTab from './CampanhasTab'
import CardapioAnaliseTab from './CardapioAnaliseTab'

interface Props { tenantSlug: string }

type Aba = 'visao' | 'ficha360' | 'fidelidade' | 'segmentacao' | 'funil' | 'campanhas' | 'cardapio'

const ABAS: { key: Aba; label: string; icon: any }[] = [
  { key: 'visao',        label: 'Visão Geral',  icon: TrendingUp },
  { key: 'ficha360',     label: 'Clientes',     icon: Users },
  { key: 'fidelidade',   label: 'Fidelidade',   icon: Gift },
  { key: 'segmentacao',  label: 'Segmentação',  icon: Radar },
  { key: 'funil',        label: 'Funil B2B',    icon: Handshake },
  { key: 'campanhas',    label: 'Campanhas',    icon: Megaphone },
  { key: 'cardapio',     label: 'Cardápio Digital', icon: QrCode },
]

export default function CrmView({ tenantSlug }: Props) {
  const [aba, setAba] = useState<Aba>('visao')

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

      {aba === 'visao'       && <VisaoGeralTab tenantSlug={tenantSlug} />}
      {aba === 'ficha360'    && <Ficha360Busca tenantSlug={tenantSlug} />}
      {aba === 'fidelidade'  && <FidelidadeView tenantSlug={tenantSlug} semTitulo />}
      {aba === 'segmentacao' && <SegmentacaoTab tenantSlug={tenantSlug} />}
      {aba === 'funil'       && <FunilB2bTab tenantSlug={tenantSlug} />}
      {aba === 'campanhas'   && <CampanhasTab tenantSlug={tenantSlug} />}
      {aba === 'cardapio'    && <CardapioAnaliseTab tenantSlug={tenantSlug} />}
    </div>
  )
}
