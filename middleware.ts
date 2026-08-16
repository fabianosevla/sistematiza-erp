import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// /onboarding saiu daqui: a tela mostra a marca e os campos de criação de
// empresa, e não havia motivo para qualquer pessoa da internet enxergá-la.
// Quem precisa dela — um cliente novo — já está autenticado quando chega, e
// `auth().protect()` deixa passar. Deslogado agora vai para o login.
// /cardapio e a API dele são as únicas URLs do sistema pensadas pra abrir
// sem login — o cliente lendo o cardápio pelo QR Code no celular. A rota
// valida por conta própria que o tenant existe e contratou o módulo (ver
// lib/auth/tenantPublico.ts); aqui só decide que não passa por auth().protect().
//
// Listadas uma a uma, sem (.*) — /api/:tenant/cardapio/config é autenticada
// (tela de configuração do menu Cardápio Digital, exige admin) e não pode
// cair aqui só por compartilhar o prefixo com as rotas públicas.
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/cardapio(.*)',
  '/api/:tenant/cardapio',
  '/api/:tenant/cardapio/mensagem',
])

export default clerkMiddleware((auth, req) => {
  if (!isPublicRoute(req)) {
    auth().protect()
  }
  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}