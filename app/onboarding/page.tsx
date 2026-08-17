import { usuarioLogado } from '@/lib/auth/identidade'
import { tenantsDoUsuarioPorEmail } from '@/lib/auth/tenant'

// Cadastro de empresa não é self-service — ver app/api/onboarding/route.ts
// pro histórico da falha que isso corrigiu. Quem cai aqui é conta autenticada
// sem acesso ao tenant que tentou abrir: link antigo, e-mail nunca convidado,
// convite ainda não aceito em nenhum tenant — ou, o caso mais comum na
// prática, uma conta que TEM empresa mas tentou abrir uma que não é dela
// (ex.: admin de um cliente testando a URL de outro). A mensagem genérica
// "sua conta não está vinculada a nenhuma empresa" confundia esse segundo
// caso: a pessoa tem empresa, só não é aquela.
export default async function OnboardingPage() {
  const user = await usuarioLogado()
  const empresas = user?.email ? await tenantsDoUsuarioPorEmail(user.email) : []

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

        <div className="bg-white rounded-xl p-8 text-center">
          {empresas.length > 0 ? (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Sua conta não tem acesso a esta empresa</h1>
              <p className="text-sm text-gray-500 mb-5">
                Você tem acesso à{empresas.length > 1 ? 's' : ''} empresa{empresas.length > 1 ? 's' : ''} abaixo. Se esperava
                acesso a outra, fale com quem te convidou.
              </p>
              <div className="flex flex-col gap-2">
                {empresas.map(e => (
                  <a
                    key={e.slug}
                    href={`/${e.slug}`}
                    className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    {e.name}
                  </a>
                ))}
              </div>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">Sua conta ainda não está vinculada a nenhuma empresa</h1>
              <p className="text-sm text-gray-500">
                O acesso é liberado pelo administrador do sistema. Se você esperava ter acesso
                a uma empresa, fale com quem te convidou ou entre em contato com o suporte.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
