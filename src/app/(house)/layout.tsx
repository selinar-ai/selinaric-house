import Sidebar from '@/components/Sidebar'
import AuthGuard from '@/components/AuthGuard'

export default function HouseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-house-bg">
        <Sidebar />
        <main className="flex-1 ml-56 min-h-screen">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
