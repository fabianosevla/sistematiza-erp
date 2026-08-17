// Cadastro de empresa não é self-service — ver app/api/onboarding/route.ts
// pro histórico da falha que isso corrigiu. Quem cai aqui é conta autenticada
// sem tenant vinculado: link antigo, e-mail nunca convidado, ou convite ainda
// não aceito de verdade em nenhum tenant.
export default function OnboardingPage() {
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
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Sua conta ainda não está vinculada a nenhuma empresa</h1>
          <p className="text-sm text-gray-500">
            O acesso é liberado pelo administrador do sistema. Se você esperava ter acesso
            a uma empresa, fale com quem te convidou ou entre em contato com o suporte.
          </p>
        </div>
      </div>
    </div>
  )
}
