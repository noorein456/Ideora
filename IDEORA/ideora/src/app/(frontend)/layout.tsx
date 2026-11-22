import React from 'react'
import type { Metadata } from 'next'
import './styles.css'

const title = 'IDEORA — Evidence before investment'
const description =
  'Test your business idea with live Google Search, Maps, and review evidence, plus budget, cost and profit forecasts.'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title,
  description,
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title,
    description,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-zinc-950 antialiased">
        <div id="root" tabIndex={-1}>
          {children}
        </div>
      </body>
    </html>
  )
}
