'use client'
import { useState } from 'react'
import { CreditCard, FileText, User, Building2, Landmark, ToggleLeft } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import CaixaView from './CaixaView'
import ArquivosView from './ArquivosView'
import MeuPerfilView from './MeuPerfilView'
import DadosEmpresaView from './DadosEmpresaView'
import FiscalConfigView from './FiscalConfigView'
import HabilitacoesModulosView from './HabilitacoesModulosView'

/**
 * components/modules/configuracoes/ConfiguracoesView.tsx
 *
 * Terceira forma desta tela: já foi acordeão único, já foi submenu da
 * sidebar com uma página por seção (não coube — 6 itens expandidos
 * estouravam a barra lateral). Agora é uma página só com ABAS, no mesmo
 * padrão de Consultas (`components/modules/consultas/ConsultasView.tsx`) —
 * estado local (`useState`), sem depender de rota por aba. Cada aba
 * renderiza o mesmo componente de View que já existia (mesmas queries,
 * mesmas mutations, mesmos campos); só perderam o `PageHeader` próprio,
 * porque agora só há um título de página, não seis.
 */

interface Props { tenantSlug: string }

type Aba = 'caixa' | 'arquivos' | 'meu-perfil' | 'dados-da-empresa' | 'fiscal' | 'modulos'

const ABAS: { valor: Aba; rotulo: string; icone: any }[] = [
  { valor: 'caixa',             rotulo: 'Caixa',                  icone: CreditCard },
  { valor: 'arquivos',          rotulo: 'Arquivos',               icone: FileText },
  { valor: 'meu-perfil',        rotulo: 'Meu perfil',             icone: User },
  { valor: 'dados-da-empresa',  rotulo: 'Dados da empresa',       icone: Building2 },
  { valor: 'fiscal',            rotulo: 'Fiscal',                 icone: Landmark },
  { valor: 'modulos',           rotulo: 'Habilitações de módulos',icone: ToggleLeft },
]

export default function ConfiguracoesView({ tenantSlug }: Props) {
  const [aba, setAba] = useState<Aba>('caixa')

  return (
    <div>
      <PageHeader titulo="Configurações" />

      {/* ── ABAS ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-100 mb-4">
        <div className="flex items-stretch">
          {ABAS.map(item => {
            const Icone = item.icone
            const ativa = aba === item.valor
            return (
              <button
                key={item.valor}
                onClick={() => setAba(item.valor)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  ativa ? 'border-green-500 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icone size={14} />
                {item.rotulo}
              </button>
            )
          })}
        </div>
      </div>

      {aba === 'caixa'            && <CaixaView tenantSlug={tenantSlug} />}
      {aba === 'arquivos'         && <ArquivosView tenantSlug={tenantSlug} />}
      {aba === 'meu-perfil'       && <MeuPerfilView tenantSlug={tenantSlug} />}
      {aba === 'dados-da-empresa' && <DadosEmpresaView tenantSlug={tenantSlug} />}
      {aba === 'fiscal'           && <FiscalConfigView tenantSlug={tenantSlug} />}
      {aba === 'modulos'          && <HabilitacoesModulosView tenantSlug={tenantSlug} />}
    </div>
  )
}
