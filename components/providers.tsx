'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ToastProvider } from '@/components/ui/Toast'

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60,
        retry: 1,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {/* Sem este ToastProvider, useToast() cai no contexto default (no-op) e
          NENHUM toast do app renderiza — nem sucesso nem erro. Era a causa de
          "Registro já existente" não aparecer em produtos/insumos/fornecedores. */}
      <ToastProvider>
        {children}
      </ToastProvider>
    </QueryClientProvider>
  )
}