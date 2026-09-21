import type { Metadata } from 'next'
import './globals.css'

const title = 'Pong — Human vs Jev'
const description =
  'Play Pong against Jev, a System One model from TypeSafe. It reads the ball as normalized state and returns one typed move — MOVE_UP, MOVE_DOWN, or STAY — every tick. No tokens, no hallucination. Can you out-reflex it?'

export const metadata: Metadata = {
  metadataBase: new URL('https://ping-pong-jev.vercel.app'),
  title: {
    default: title,
    template: '%s | Human vs Jev',
  },
  description,
  keywords: ['Jev', 'TypeSafe', 'System One', 'Pong', 'AI game', 'typed decisions'],
  openGraph: { title, description, type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
