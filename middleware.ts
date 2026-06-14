import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/onboarding(.*)',
])

export default clerkMiddleware((auth, req) => {
  // Rotas públicas passam livre
  if (isPublicRoute(req)) return NextResponse.next()

  // Para todo o resto, o server component cuida do redirect
  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next|favicon.ico|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}