import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import Providers from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'sistematiza.erp',
  description: 'ERP SaaS para pequenas e médias empresas',
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
