'use client'
import { Bookmark, X, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useFiltrosSalvos } from '@/hooks/useFiltrosSalvos'

interface Props {
  tenantSlug:    string
  modulo:        string
  filtrosAtuais: Record<string, any>
  onAplicar:     (filtros: Record<string, any>) => void
}

export function FiltrosSalvos({ tenantSlug, modulo, filtrosAtuais, onAplicar }: Props) {
  const { filtros, salvarMut, deletarMut, showSalvar, setShowSalvar, nomeFiltro, setNomeFiltro } = useFiltrosSalvos(tenantSlug, modulo)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Filtros salvos */}
      {filtros.map((f: any) => (
        <div key={f.filtro_id} className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 group">
          <button onClick={() => onAplicar(f.filtros)} className="text-xs font-medium text-blue-700 hover:text-blue-900">
            {f.nome}
          </button>
          <button onClick={() => deletarMut.mutate(f.filtro_id)} className="text-blue-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
            <X size={11} />
          </button>
        </div>
      ))}

      {/* Botão salvar filtro atual */}
      {!showSalvar ? (
        <button onClick={() => setShowSalvar(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 hover:border-gray-400 rounded-lg transition-colors">
          <Bookmark size={12} /> Salvar filtro atual
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            value={nomeFiltro}
            onChange={e => setNomeFiltro(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && nomeFiltro.trim()) salvarMut.mutate(filtrosAtuais); if (e.key === 'Escape') setShowSalvar(false) }}
            placeholder="Nome do filtro..."
            className="h-8 text-sm w-36"
            autoFocus
          />
          <Button size="sm" onClick={() => salvarMut.mutate(filtrosAtuais)} disabled={!nomeFiltro.trim() || salvarMut.isPending}>
            <Plus size={12} className="mr-1" /> Salvar
          </Button>
          <button onClick={() => setShowSalvar(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
      )}
    </div>
  )
}