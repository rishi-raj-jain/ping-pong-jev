import { ImageResponse } from 'next/og'

// Static share card: a mini table and the hook, so links unfurl into something
// that says "come play" rather than a bare URL.
export const alt = 'Pong — Human vs Jev, a System One model from TypeSafe'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #0b0f14 0%, #0f1a28 100%)',
        color: '#eef4fb',
        fontFamily: 'sans-serif',
        padding: 64,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 26, color: '#9fb0c3' }}>
        <span style={{ color: '#ef4444' }}>●</span> Human
        <span style={{ color: '#61758c' }}>vs</span>
        <span style={{ color: '#2dd4bf' }}>Jev</span>
        <span style={{ color: '#2dd4bf' }}>●</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34 }}>
        <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05 }}>Can you beat a</div>
        <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1.05, color: '#2dd4bf' }}>System One model at Pong?</div>
      </div>

      {/* Mini table */}
      <div
        style={{
          display: 'flex',
          position: 'relative',
          marginTop: 44,
          height: 300,
          borderRadius: 18,
          background: 'linear-gradient(135deg, #1c63b8, #124a92)',
          border: '8px solid #6f4420',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', left: '50%', top: 16, bottom: 16, width: 4, background: 'rgba(255,255,255,0.5)' }} />
        <div style={{ position: 'absolute', left: 16, right: 16, top: '50%', height: 3, background: 'rgba(255,255,255,0.45)' }} />
        <div style={{ position: 'absolute', left: 30, top: 96, width: 16, height: 108, borderRadius: 8, background: '#ef4444' }} />
        <div style={{ position: 'absolute', right: 30, top: 120, width: 16, height: 108, borderRadius: 8, background: '#2dd4bf' }} />
        <div style={{ position: 'absolute', left: 470, top: 150, width: 22, height: 22, borderRadius: 11, background: '#fdfdf5' }} />
      </div>

      <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 26, fontSize: 26, color: '#9fb0c3' }}>State in → one typed target out. No tokens. No hallucination. · ping-pong-jev</div>
    </div>,
    size,
  )
}
