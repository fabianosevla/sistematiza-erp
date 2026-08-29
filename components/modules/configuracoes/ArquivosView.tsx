'use client'
import { Download } from 'lucide-react'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'

/**
 * components/modules/configuracoes/ArquivosView.tsx
 *
 * Era a seção "Arquivos" do acordeão único de Configurações; virou página
 * própria (/[tenant]/configuracoes/arquivos). Sem estado, sem mutation — só
 * um link de download, igual estava.
 */

interface Props { tenantSlug: string }

export default function ArquivosView({ tenantSlug }: Props) {
  return (
    <div>
      <PageHeader titulo="Arquivos" />
      <div className="max-w-3xl bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1">
          Atalho do PDV
          <InfoTip titulo="Atalho do PDV">Cria um ícone que abre o PDV em tela limpa e imprime o cupom sem perguntar.</InfoTip>
        </p>
        <div className="flex items-center gap-3">
          <a
            href={`/api/${tenantSlug}/atalho-pdv`}
            download
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors">
            <Download size={13} />
            Instalar no computador
          </a>
          <p className="text-xs text-gray-400">
            Baixe, clique com o botão direito e escolha "Executar como administrador".
          </p>
        </div>
      </div>
    </div>
  )
}
