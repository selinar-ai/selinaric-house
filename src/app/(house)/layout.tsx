import Sidebar from '@/components/Sidebar'
import MobileNav from '@/components/MobileNav'
import AuthGuard from '@/components/AuthGuard'

export default function HouseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <div className="flex flex-col h-full bg-house-bg">
        {/* Desktop sidebar — fixed, outside flow */}
        <Sidebar />

        {/* Main content — fills remaining space */}
        <main className="flex-1 min-h-0 ml-0 md:ml-56 flex flex-col overflow-hidden">
          {children}
        </main>

        {/* Mobile bottom nav — in normal flow at bottom, no position:fixed needed */}
        <MobileNav />
      </div>
    </AuthGuard>
  )
}
