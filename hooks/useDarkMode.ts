'use client'
// hooks/useDarkMode.ts
//
// Hook compartilhado de Modo Escuro — usado pelo Dashboard (ClientShell),
// PDV (PdvShell) e Selecionar Módulo (SelecionarModuloClient), pra que a
// preferência seja a mesma em qualquer tela do sistema, não só dentro do
// Gerencial. Também passa a PERSISTIR no banco (antes só vivia em estado
// local do ClientShell e resetava a cada navegação).
import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const STYLE_ID = 'sistematiza-dark'

const DARK_CSS = `
  body { background-color: #111827 !important; color: #f9fafb !important; }
  .bg-white { background-color: #1f2937 !important; }
  .bg-gray-50, .bg-gray-100 { background-color: #111827 !important; }
  .border-gray-100, .border-gray-200 { border-color: #374151 !important; }
  .text-gray-900 { color: #f9fafb !important; }
  .text-gray-700, .text-gray-600 { color: #d1d5db !important; }
  .text-gray-500, .text-gray-400 { color: #9ca3af !important; }
`

export function useDarkMode(tenantSlug: string, valorInicial = false) {
  const qc = useQueryClient()
  const [darkMode, setDarkMode] = useState(valorInicial)

  // Sincroniza com o valor salvo no banco — cobre as telas que não recebem
  // o valor inicial via SSR (PDV e Selecionar Módulo já recebem, mas isso
  // garante consistência se o usuário trocar em outra aba/dispositivo)
  const { data } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
    staleTime: 60000,
  })

  useEffect(() => {
    if (typeof data?.data?.darkMode === 'boolean') setDarkMode(data.data.darkMode)
  }, [data?.data?.darkMode])

  useEffect(() => {
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (darkMode) {
      if (!style) {
        style = document.createElement('style')
        style.id = STYLE_ID
        document.head.appendChild(style)
      }
      style.textContent = DARK_CSS
    } else {
      style?.remove()
    }
  }, [darkMode])

  const salvarMut = useMutation({
    mutationFn: async (novoValor: boolean) => {
      const res = await fetch(`/api/${tenantSlug}/configuracoes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ darkMode: novoValor }),
      })
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['configuracoes', tenantSlug] }),
  })

  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev
      salvarMut.mutate(next)
      return next
    })
  }, [salvarMut])

  return { darkMode, toggleDarkMode }
}