import Sidebar from '@/components/Sidebar'
import AuthGuard from '@/components/AuthGuard'

export default function HouseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <div className="flex h-full overflow-hidden bg-house-bg">
        <Sidebar />
        <main className="flex-1 ml-56 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
