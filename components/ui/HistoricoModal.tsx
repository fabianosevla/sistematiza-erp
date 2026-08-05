'use client'
// components/ui/HistoricoModal.tsx
//
// O nome continua "Modal" de propósito: ele é importado por várias telas e
// renomear obrigaria a mexer em todas elas. Por dentro, virou painel lateral —
// a regra do sistema é que só confirmação usa modal.
//
// Ganho concreto aqui: o histórico é uma tela de CONFERÊNCIA. Com o painel na
// direita, o registro que originou a dúvida continua visível atrás, e o botão
// Expandir abre a linha do tempo inteira quando há muita alteração.
import { useQuery } from '@tanstack/react-query'
import { Clock, Plus, Pencil, Trash2 } from 'lucide-react'
import { SidePanel } from '@/components/ui/SidePanel'

interface Props {
  tenantSlug: string
  entidade:   string
  entidadeId: number
  titulo:     string
  onClose:    () => void
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const ACAO_CONFIG: Record<string, { label: string; cor: string; icon: any }> = {
  criado:     { label: 'Criado',     cor: 'bg-green-100 text-green-700',  icon: Plus },
  atualizado: { label: 'Atualizado', cor: 'bg-gray-100 text-gray-700',    icon: Pencil },
  excluido:   { label: 'Excluído',   cor: 'bg-red-100 text-red-700',      icon: Trash2 },
  reativado:  { label: 'Reativado',  cor: 'bg-amber-100 text-amber-700',  icon: Plus },
}

export function HistoricoModal({ tenantSlug, entidade, entidadeId, titulo, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['historico', tenantSlug, entidade, entidadeId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/historico?entidade=${entidade}&entidadeId=${entidadeId}`)).json(),
  })

  const itens = Array.isArray(data?.data) ? data.data : []

  return (
    <SidePanel
      titulo="Histórico de Alterações"
      subtitulo={titulo}
      onClose={onClose}
      largura="w-[28vw] min-w-[480px]"
    >
      {/* Timeline */}
      <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : itens.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock size={28} className="text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-500">Nenhuma alteração registrada</p>
              <p className="text-xs text-gray-400 mt-1">O histórico aparece automaticamente quando registros são criados ou alterados</p>
            </div>
          ) : (
            <div className="relative">
              {/* Linha vertical */}
              <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-100" />

              <div className="space-y-4">
                {itens.map((item: any) => {
                  const cfg = ACAO_CONFIG[item.acao] ?? { label: item.acao, cor: 'bg-gray-100 text-gray-600', icon: Clock }
                  const Icon = cfg.icon
                  return (
                    <div key={item.historico_id} className="flex gap-4 relative">
                      {/* Ícone */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${cfg.cor}`}>
                        <Icon size={12} />
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1 pb-4">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cor}`}>
                            {cfg.label}
                          </span>
                          <span className="text-xs text-gray-400 flex-shrink-0">{fmtDateTime(item.created_dt)}</span>
                        </div>

                        {item.campo && (
                          <p className="text-xs font-medium text-gray-700 mb-1">
                            Campo: <span className="font-mono bg-gray-100 px-1 rounded">{item.campo}</span>
                          </p>
                        )}

                        {item.valor_anterior && item.valor_novo && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded line-through max-w-[120px] truncate">{item.valor_anterior}</span>
                            <span className="text-gray-400">→</span>
                            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded max-w-[120px] truncate">{item.valor_novo}</span>
                          </div>
                        )}

                        {item.descricao && (
                          <p className="text-xs text-gray-500 mt-1">{item.descricao}</p>
                        )}

                        <p className="text-xs text-gray-400 mt-1">por {item.usuario_nome}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
          </div>
        )}
      </div>
    </SidePanel>
  )
}