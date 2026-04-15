import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Selináric House',
  description: 'A structured environment for presence, memory, and continuity.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="bg-house-bg text-text-primary antialiased h-dvh overflow-hidden">
        {children}
      </body>
    </html>
  )
}
