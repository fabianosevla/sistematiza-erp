'use client'
import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, Download, CheckCircle, AlertCircle, FileText } from 'lucide-react'
import { SidePanel } from '@/components/ui/SidePanel'
import { Button } from '@/components/ui/button'
import { gerarCSV, parseCSV, TEMPLATES, type EntidadeImportacao } from '@/lib/importacao/templates'

interface Props {
  tenantSlug:  string
  entidade:    EntidadeImportacao
  queryKey:    string
  onClose:     () => void
}

type Step = 'upload' | 'preview' | 'resultado'

export default function ImportacaoModal({ tenantSlug, entidade, queryKey, onClose }: Props) {
  const queryClient = useQueryClient()
  const fileRef     = useRef<HTMLInputElement>(null)
  const [step, setStep]         = useState<Step>('upload')
  const [rows, setRows]         = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading]   = useState(false)
  const [resultado, setResultado] = useState<{ sucesso: number; total: number; erros: { linha: number; campo: string; mensagem: string }[] } | null>(null)
  const [error, setError]       = useState('')

  const template = TEMPLATES[entidade]

  function baixarTemplate() {
    const csv  = gerarCSV(entidade)
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `template-${entidade}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFile(file: File) {
    if (!file) return
    setFileName(file.name)
    setError('')
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text   = e.target?.result as string
        const parsed = parseCSV(text)
        if (parsed.length === 0) {
          setError('Arquivo vazio ou formato inválido. Use o template fornecido.')
          return
        }
        setRows(parsed)
        setStep('preview')
      } catch {
        setError('Erro ao ler o arquivo. Verifique o formato.')
      }
    }
    reader.readAsText(file, 'UTF-8')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function confirmarImportacao() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/${tenantSlug}/importar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entidade, rows }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Erro na importação')
      setResultado(data.data)
      setStep('resultado')
      queryClient.invalidateQueries({ queryKey: [queryKey, tenantSlug] })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const LABEL: Record<EntidadeImportacao, string> = {
    clientes:      'Clientes',
    fornecedores:  'Fornecedores',
    produtos:      'Produtos',
    insumos:       'Insumos',
  }

  return (
    <SidePanel
      titulo={`Importar ${LABEL[entidade]}`}
      subtitulo={
        step === 'upload'   ? 'Faça upload de um arquivo CSV'
      : step === 'preview'  ? `${rows.length} registro${rows.length !== 1 ? 's' : ''} encontrado${rows.length !== 1 ? 's' : ''}`
      :                       'Importação concluída'
      }
      onClose={onClose}
      largura="w-[36vw] min-w-[600px]"
      rodape={
        <>
          {/* flex-1 empurra os botões para a direita e deixa a contagem à esquerda,
              como era no rodapé antigo. */}
          <div className="flex-1">
            {step === 'preview' && (
              <p className="text-xs text-gray-400">
                {rows.length} registro{rows.length !== 1 ? 's' : ''} serão importados
              </p>
            )}
          </div>
          {step === 'resultado' ? (
            <Button onClick={onClose}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              {step === 'preview' && (
                <Button onClick={confirmarImportacao} disabled={loading || rows.length === 0}>
                  {loading ? 'Importando...' : `Importar ${rows.length} registro${rows.length !== 1 ? 's' : ''}`}
                </Button>
              )}
            </>
          )}
        </>
      }
    >

        {/* Body */}
        <div className="p-6">

          {/* STEP 1 — Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Instruções */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-600 mb-2">Colunas esperadas:</p>
                <div className="flex flex-wrap gap-1">
                  {template.colunas.map(col => (
                    <span key={col} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs font-mono text-gray-600">{col}</span>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">{template.instrucoes}</p>
              </div>

              {/* Download template */}
              <button
                onClick={baixarTemplate}
                className="w-full flex items-center justify-between px-4 py-3 border border-green-200 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Download size={16} className="text-green-600" />
                  <span className="text-sm font-medium text-green-700">Baixar template CSV</span>
                </div>
                <span className="text-xs text-green-600">Com exemplos preenchidos</span>
              </button>

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-colors"
              >
                <Upload size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-600">
                  {fileName ? fileName : 'Arraste o arquivo aqui ou clique para selecionar'}
                </p>
                <p className="text-xs text-gray-400 mt-1">Suporta .csv (UTF-8)</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 2 — Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Verifique os dados antes de importar:
                </p>
                <button
                  onClick={() => { setStep('upload'); setRows([]); setFileName('') }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Trocar arquivo
                </button>
              </div>

              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-400 font-medium w-10">#</th>
                        {template.colunas.map(col => (
                          <th key={col} className="px-3 py-2 text-left text-gray-400 font-medium whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 50).map((row, i) => (
                        <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                          <td className="px-3 py-2 text-gray-400">{i + 2}</td>
                          {template.colunas.map(col => (
                            <td key={col} className="px-3 py-2 text-gray-700 max-w-32 truncate">
                              {row[col] || <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 50 && (
                  <div className="px-3 py-2 bg-gray-50 text-xs text-gray-400 border-t border-gray-100">
                    Mostrando 50 de {rows.length} registros
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 3 — Resultado */}
          {step === 'resultado' && resultado && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{resultado.total}</p>
                  <p className="text-xs text-gray-400 mt-1">Total</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{resultado.sucesso}</p>
                  <p className="text-xs text-green-500 mt-1">Importados</p>
                </div>
                <div className={`${resultado.erros.length > 0 ? 'bg-red-50' : 'bg-gray-50'} rounded-lg p-4 text-center`}>
                  <p className={`text-2xl font-bold ${resultado.erros.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>{resultado.erros.length}</p>
                  <p className={`text-xs mt-1 ${resultado.erros.length > 0 ? 'text-red-400' : 'text-gray-400'}`}>Erros</p>
                </div>
              </div>

              {resultado.sucesso > 0 && (
                <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle size={15} className="text-green-500" />
                  <p className="text-sm text-green-700">
                    {resultado.sucesso} registro{resultado.sucesso !== 1 ? 's' : ''} importado{resultado.sucesso !== 1 ? 's' : ''} com sucesso.
                  </p>
                </div>
              )}

              {resultado.erros.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Erros encontrados:</p>
                  <div className="border border-red-100 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    {resultado.erros.map((e, i) => (
                      <div key={i} className="flex items-start gap-3 px-3 py-2 border-b border-red-50 last:border-0 bg-red-50/50">
                        <span className="text-xs text-red-400 font-mono whitespace-nowrap">Linha {e.linha}</span>
                        <span className="text-xs text-red-500 font-mono">{e.campo}:</span>
                        <span className="text-xs text-red-600">{e.mensagem}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
    </SidePanel>
  )
}