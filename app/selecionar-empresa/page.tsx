import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { tenantsDoUsuarioPorEmail } from '@/lib/auth/tenant'

// ESCOLHA DE EMPRESA.
//
// Só aparece para quem pertence a mais de uma — suporte, ou um contador que
// atende dois clientes. Com uma empresa só, a raiz redireciona direto e esta
// tela nunca é vista.
//
// No Kuantum o equivalente é o campo "Organização" no formulário de login: a
// pessoa digita em qual entra. Aqui a lista vem pronta, porque o sistema já
// sabe quais são — e ninguém precisa decorar identificador.
export default async function SelecionarEmpresa() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user  = await currentUser()
  const email = user?.emailAddresses?.[0]?.emailAddress
  const empresas = email ? await tenantsDoUsuarioPorEmail(email) : []

  if (empresas.length === 0) redirect('/onboarding')
  if (empresas.length === 1) redirect(`/${empresas[0].slug}/selecionar-modulo`)

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0F1117' }}>
      <div className="w-full max-w-md px-4">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex items-center gap-2">
            <img src="/apple-icon.png" alt="" className="h-8 w-8 flex-shrink-0 rounded object-contain" />
            <div className="flex items-baseline">
              <span className="text-3xl font-bold text-white tracking-tight">Sistematiza</span>
              <span className="text-3xl font-bold tracking-tight" style={{ color: '#2ecc71' }}>.ai</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-5">Escolha a empresa</h1>
          <div className="space-y-2">
            {empresas.map(e => (
              <Link
                key={e.slug}
                href={`/${e.slug}/selecionar-modulo`}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:border-gray-300 hover:bg-gray-50 transition-colors">
                <span className="text-sm font-medium text-gray-900">{e.name}</span>
                <span className="text-xs text-gray-400 font-mono">{e.slug}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
