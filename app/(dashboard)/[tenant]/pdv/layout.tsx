// app/(pdv)/layout.tsx
// Layout separado para o PDV — sem sidebar, sem header do gerencial
export default function PdvLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      {children}
    </div>
  )
}