import { create } from 'zustand'

interface AuthState {
  tenantSlug: string | null
  tenantName: string | null
  userId: string | null
  role: 'admin' | 'user' | null
  setAuth: (data: Partial<Omit<AuthState, 'setAuth' | 'clearAuth'>>) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  tenantSlug: null,
  tenantName: null,
  userId: null,
  role: null,
  setAuth: (data) => set((state) => ({ ...state, ...data })),
  clearAuth: () => set({ tenantSlug: null, tenantName: null, userId: null, role: null }),
}))
