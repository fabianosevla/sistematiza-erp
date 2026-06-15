'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'

export function useFiltrosSalvos(tenantSlug: string, modulo: string) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/filtros?modulo=${modulo}`
  const [showSalvar, setShowSalvar] = useState(false)
  const [nomeFiltro, setNomeFiltro] = useState('')

  const { data } = useQuery({
    queryKey: ['filtros', tenantSlug, modulo],
    queryFn:  async () => (await fetch(api)).json(),
  })

  const salvarMut = useMutation({
    mutationFn: (filtros: any) => fetch(`/api/${tenantSlug}/filtros`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modulo, nome: nomeFiltro.trim(), filtros }),
    }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['filtros', tenantSlug, modulo] })
      setShowSalvar(false); setNomeFiltro(''); toast('Filtro salvo!')
    },
    onError: () => toast('Erro ao salvar filtro.', 'error'),
  })

  const deletarMut = useMutation({
    mutationFn: (id: number) => fetch(`/api/${tenantSlug}/filtros?id=${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['filtros', tenantSlug, modulo] }); toast('Filtro removido.') },
  })

  const filtros = Array.isArray(data?.data) ? data.data : []

  return { filtros, salvarMut, deletarMut, showSalvar, setShowSalvar, nomeFiltro, setNomeFiltro }
}