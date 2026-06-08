'use client'
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { CheckCircle, X, AlertTriangle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'
interface ToastItem { id: string; message: string; type: ToastType }
interface ToastContextType { toast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3800)
  }, [])

  const remove = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const BG: Record<ToastType, string> = {
    success: 'bg-green-600',
    error:   'bg-red-600',
    warning: 'bg-amber-500',
    info:    'bg-gray-800',
  }
  const IconMap: Record<ToastType, typeof CheckCircle> = {
    success: CheckCircle,
    error:   X,
    warning: AlertTriangle,
    info:    Info,
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none w-80">
        {toasts.map(t => {
          const Icon = IconMap[t.type]
          return (
            <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium text-white pointer-events-auto ${BG[t.type]}`}>
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button onClick={() => remove(t.id)} className="opacity-60 hover:opacity-100 flex-shrink-0"><X size={14} /></button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() { return useContext(ToastContext) }