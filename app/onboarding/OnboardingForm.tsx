'use client'

import { useState } from 'react'
import { useUser } from '@clerk/nextjs'

export default function OnboardingForm() {
  const { user } = useUser()

  const [name, setName]       = useState('')
  const [slug, setSlug]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

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
      window.location.href = `/${slug}`
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0F1117' }}>
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <span className="text-3xl font-semibold text-white">sistematiza</span>
          <span className="text-3xl font-semibold" style={{ color: '#2ecc71' }}>.ia</span>
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
                placeholder="Ex: Zaghi Massas Caseiras"
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
                placeholder="zaghi-massas"
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
              className="w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
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