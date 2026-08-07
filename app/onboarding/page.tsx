'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

export default function OnboardingPage() {
  const { user } = useUser()
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Se já tem tenant, redireciona
  if (user?.publicMetadata?.tenantSlug) {
    router.push(`/${user.publicMetadata.tenantSlug}`)
    return null
  }

  function handleNameChange(val: string) {
    setName(val)
    const autoSlug = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    setSlug(autoSlug)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message ?? 'Erro ao criar empresa.')
        return
      }
      await user?.reload()
      router.push(`/${slug}`)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0F1117' }}>
      <div className="w-full max-w-md px-4">
        {/* Marca igual à da Sidebar e do PDV: logo + Sistematiza.ai. */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex items-center gap-2">
            <img src="/apple-icon.png" alt="" className="h-8 w-8 flex-shrink-0 rounded object-contain" />
            <div className="flex items-baseline">
              <span className="text-3xl font-bold text-white tracking-tight">Sistematiza</span>
              <span className="text-3xl font-bold tracking-tight" style={{ color: '#2ecc71' }}>.ai</span>
            </div>
          </div>
          <p className="text-white/50 text-sm mt-2">Configure sua empresa para começar</p>
        </div>

        <div className="bg-white rounded-xl p-8">
          <h1 className="text-xl font-semibold text-gray-900 mb-6">Criar minha empresa</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome da empresa *
              </label>
              <input
                type="text"
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="Ex: Minha Empresa Ltda"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Identificador (slug) *
              </label>
              <input
                type="text"
                value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="minha-empresa"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Apenas letras minúsculas, números e hífens</p>
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !name || !slug}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#2ecc71', color: '#0F1117' }}
            >
              {loading ? 'Criando...' : 'Criar empresa e continuar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
