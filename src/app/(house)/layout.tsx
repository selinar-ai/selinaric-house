import Sidebar from '@/components/Sidebar'
import AuthGuard from '@/components/AuthGuard'

export default function HouseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-house-bg">
        <Sidebar />
        <main className="flex-1 ml-56 h-screen overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
