export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded-lg ${className}`} />
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-gray-100">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className={`animate-pulse bg-gray-100 rounded h-3.5 ${j === 0 ? 'w-40' : 'w-20 mx-auto'}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
