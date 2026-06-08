import { useQuery } from '@tanstack/react-query'

export function useDominio(
  tenantSlug: string,
  codigo: string,
  fallback: string[] = []
): string[] {
  const { data } = useQuery({
    queryKey: ['dominio', tenantSlug, codigo],
    queryFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/dominios/${codigo}`)
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  return Array.isArray(data?.data?.valores)
    ? data.data.valores.map((v: any) => v.valor)
    : fallback
}