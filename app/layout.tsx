// ESTE ARQUIVO VAI EM: app/layout.tsx
import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import Providers from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'ERP Sistematiza.ai',
  description: 'Gestão e controle do seu negócio',
  // Aba do navegador e atalho na tela inicial do celular.
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/apple-icon.png', type: 'image/png', sizes: '180x180' },
    ],
    apple: '/apple-icon.png',
    shortcut: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="pt-BR">
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  )
}