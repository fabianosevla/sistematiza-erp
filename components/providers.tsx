'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { ToastProvider } from '@/components/ui/Toast'

export default function Providers({ children }: { children: React.ReactNode }) {
  // CAMPO NUMÉRICO NÃO MUDA SOZINHO.
  //
  // <input type="number"> soma/subtrai o "step" quando a rodinha do mouse gira
  // com o cursor em cima dele, e quando se aperta seta para cima/baixo. Era o
  // que fazia os centavos dos Gastos Fixos "subirem" ao passar o mouse.
  // Regra global para os 70+ campos do sistema, sem depender de cada tela:
  // - rodinha: o campo perde o foco e a página rola normalmente;
  // - setas do teclado: ignoradas.
  useEffect(() => {
    const ehNumero = (el: EventTarget | null): el is HTMLInputElement =>
      el instanceof HTMLInputElement && el.type === 'number'
    const naRoda = (e: WheelEvent) => {
      if (ehNumero(e.target) && document.activeElement === e.target) e.target.blur()
    }
    const naTecla = (e: KeyboardEvent) => {
      if (ehNumero(e.target) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) e.preventDefault()
    }
    document.addEventListener('wheel', naRoda, { passive: true })
    document.addEventListener('keydown', naTecla)
    return () => {
      document.removeEventListener('wheel', naRoda)
      document.removeEventListener('keydown', naTecla)
    }
  }, [])

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