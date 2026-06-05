export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0F1117' }}>
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <span className="text-3xl font-semibold text-white">sistematiza</span>
          <span className="text-3xl font-semibold" style={{ color: '#2ecc71' }}>.ia</span>
        </div>
        {children}
      </div>
    </div>
  )
}
