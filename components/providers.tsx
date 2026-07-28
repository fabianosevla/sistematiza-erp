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
        // CORREÇÃO (F5 global): sempre que uma tela é aberta/navegada
        // (mount) ou quando o usuário volta para a aba do navegador (focus),
        // TODAS as queries refazem a busca no servidor — mesmo dentro do
        // staleTime. A tela abre instantânea com o cache e atualiza em
        // seguida com os dados frescos. Sem isso, trocar de página dentro
        // da janela de cache mostrava dados antigos e só F5 resolvia.
        refetchOnMount: 'always',
        refetchOnWindowFocus: 'always',
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