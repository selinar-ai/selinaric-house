import Sidebar from '@/components/Sidebar'
import AuthGuard from '@/components/AuthGuard'

export default function HouseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <div className="flex h-dvh overflow-hidden bg-house-bg">
        <Sidebar />
        <main className="flex-1 ml-0 md:ml-56 pb-[72px] md:pb-0 flex flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
