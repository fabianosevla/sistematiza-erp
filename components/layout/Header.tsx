import { UserButton } from '@clerk/nextjs'

interface HeaderProps {
  tenantName: string
}

export default function Header({ tenantName }: HeaderProps) {
  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-6 flex-shrink-0">
      <div />
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400 hidden sm:block">{tenantName}</span>
        <UserButton afterSignOutUrl="/sign-in" />
      </div>
    </header>
  )
}
