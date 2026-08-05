'use client'
import { useState } from 'react'
import { Download, CheckCircle, AlertTriangle } from 'lucide-react'
import { SidePanel } from '@/components/ui/SidePanel'
import { Button } from '@/components/ui/button'

interface Props {
  tenantSlug:   string
  entidade:     string
  nomeEntidade: string
  onClose:      () => void
  onSuccess:    () => void
}

export default function CsvImportModal({ tenantSlug, entidade, nomeEntidade, onClose, onSuccess }: Props) {
  const [file, setFile]         = useState<File | null>(null)
  const [loading, setLoading]   = useState(false)
  const [resultado, setResultado] = useState<any>(null)

  async function downloadTemplate() {
    const res  = await fetch(`/api/${tenantSlug}/importar?entidade=${entidade}&tipo=template`)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `template_${entidade}.csv`
    a.click()
  }

  async function importar() {
    if (!file) return
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('entidade', entidade)
      const res  = await fetch(`/api/${tenantSlug}/importar`, { method: 'POST', body: form })
      const data = await res.json()
      const result = data?.data ?? data
      setResultado(result)
      if ((result?.erros?.length ?? 0) === 0) onSuccess()
    } finally {
      setLoading(false)
    }
  }

  return (
    <SidePanel
      titulo={`Importar ${nomeEntidade}`}
      onClose={onClose}
      largura="w-[26vw] min-w-[460px]"
    >
        <div className="p-6 space-y-4">
          {!resultado ? (
            <>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">1. Baixe o template CSV</p>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download size={13} className="mr-1.5" /> Baixar template
                </Button>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">2. Preencha e faça upload</p>
                <input type="file" accept=".csv"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-200 file:text-sm file:bg-white file:text-gray-700 hover:file:bg-gray-50 cursor-pointer" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                <Button onClick={importar} disabled={!file || loading}>{loading ? 'Importando...' : 'Importar'}</Button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle size={20} className="text-green-500" />
                <div>
                  <p className="text-sm font-semibold text-green-700">Importação concluída</p>
                  <p className="text-sm text-green-600">{resultado.importados ?? 0} registros importados</p>
                </div>
              </div>
              {resultado.erros?.length > 0 && (
                <div className="border border-amber-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-50">
                    <AlertTriangle size={14} className="text-amber-500" />
                    <p className="text-sm font-medium text-amber-700">{resultado.erros.length} erros</p>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {resultado.erros.map((e: any, i: number) => (
                      <div key={i} className="px-4 py-2 border-t border-amber-100 text-xs text-gray-600">
                        <span className="font-medium">Linha {e.linha}:</span> {e.erro}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={onClose}>Fechar</Button>
              </div>
            </div>
          )}
        </div>
    </SidePanel>
  )
}