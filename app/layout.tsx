import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import Providers from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'ERP Sistematiza.AI',
  description: 'Gestão e controle do seu negócio',
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
