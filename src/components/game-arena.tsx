'use client'

/**
 * The playable table.
 *
 * One `<canvas>` runs the whole game — physics at a fixed 60 Hz step, a hand-
 * drawn top-down table-tennis table, glossy rubber paddles, a shaded ball with
 * a motion trail, and hit sparks. Alongside it, a decision loop asks Jev (or the
 * local reflex) for the right paddle's next move and feeds a live telemetry
 * panel. React state is only touched a few times a second for the surrounding
 * panels; the hot loop lives entirely in refs so rendering never stutters.
 */

import { Scoreboard } from '@/components/scoreboard'
import { TelemetryPanel } from '@/components/telemetry-panel'
import { clamp, decideLocally, FIELD, HUMAN_FACE_X, JEV_FACE_X, type JevAction, type JevDecision, type JevInput, type JevMode } from '@/lib/pong'
import { useEffect, useRef, useState } from 'react'

type Status = 'idle' | 'serving' | 'playing' | 'over'

type Ball = { x: number; y: number; vx: number; vy: number }
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string }

type Engine = {
  ball: Ball
  humanY: number
  jevY: number
  humanScore: number
  jevScore: number
  status: Status
  serveDir: 1 | -1
  action: JevAction
  rally: number
  winner: 'human' | 'jev' | null
  trail: { x: number; y: number }[]
  particles: Particle[]
  shake: number
  keys: { up: boolean; down: boolean }
  pointerY: number | null
  lastTs: number
  accum: number
  flush: number
}

// Physics, in logical px and px/second.
const STEP = 1 / 120 // fixed physics tick
const BALL_SPEED0 = 430
const BALL_SPEED_MAX = 920
const HIT_ACCEL = 1.05
const HUMAN_SPEED = 620
const JEV_SPEED = 470 // a touch slower than the human's reach, so Jev is beatable
const SPIN = 250 // how much off-center contact bends the return

const TOP = FIELD.wall + FIELD.paddleH / 2
const BOTTOM = FIELD.h - FIELD.wall - FIELD.paddleH / 2

/** Center-y (px) → normalized 0..1 over the full field height, matching ballY. */
const norm = (y: number) => y / FIELD.h

function newEngine(): Engine {
  return {
    ball: { x: FIELD.w / 2, y: FIELD.h / 2, vx: 0, vy: 0 },
    humanY: FIELD.h / 2,
    jevY: FIELD.h / 2,
    humanScore: 0,
    jevScore: 0,
    status: 'idle',
    serveDir: Math.random() < 0.5 ? -1 : 1,
    action: 'STAY',
    rally: 0,
    winner: null,
    trail: [],
    particles: [],
    shake: 0,
    keys: { up: false, down: false },
    pointerY: null,
    lastTs: 0,
    accum: 0,
    flush: 0,
  }
}

/** Normalized snapshot handed to Jev / the reflex every decision tick. */
function readState(e: Engine): JevInput {
  return {
    ballX: e.ball.x / FIELD.w,
    ballY: e.ball.y / FIELD.h,
    ballVX: e.ball.vx / FIELD.w,
    ballVY: e.ball.vy / FIELD.h,
    paddleY: norm(e.jevY),
    opponentY: norm(e.humanY),
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function GameArena() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const engineRef = useRef<Engine>(newEngine())

  // Decision plumbing — refs so the loops never trigger renders.
  const aliveRef = useRef(true)
  const modeRef = useRef<JevMode>('live') // optimistic; first tick learns the truth
  const availabilityRef = useRef<'unknown' | 'live' | 'nokey' | 'offline'>('unknown')
  const preferLocalRef = useRef(false) // user toggled "compare local"

  // Display state — updated a few times a second.
  const [status, setStatus] = useState<Status>('idle')
  const [winner, setWinner] = useState<'human' | 'jev' | null>(null)
  const [scores, setScores] = useState({ human: 0, jev: 0, rally: 0, ballSpeed: 0 })
  const [input, setInput] = useState<JevInput | null>(null)
  const [decision, setDecision] = useState<JevDecision | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [availability, setAvailability] = useState<'unknown' | 'live' | 'nokey' | 'offline'>('unknown')

  // ---- Serve / reset, callable from buttons and keys ----
  function serve() {
    const e = engineRef.current
    if (e.status === 'over') return
    if (e.status === 'idle' || e.status === 'serving') {
      e.ball = { x: FIELD.w / 2, y: FIELD.h / 2, vx: e.serveDir * BALL_SPEED0, vy: (Math.random() * 2 - 1) * 180 }
      e.trail = []
      e.rally = 0
      e.status = 'playing'
    }
  }

  function reset() {
    const keep = engineRef.current
    const e = newEngine()
    e.serveDir = keep.serveDir
    engineRef.current = e
    setWinner(null)
    setStatus('idle')
    setScores({ human: 0, jev: 0, rally: 0, ballSpeed: 0 })
  }

  useEffect(() => {
    aliveRef.current = true
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(FIELD.w * dpr)
    canvas.height = Math.round(FIELD.h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // ---------- physics ----------
    function point(scorer: 'human' | 'jev') {
      const e = engineRef.current
      if (scorer === 'human') e.humanScore++
      else e.jevScore++
      e.shake = 12
      e.rally = 0
      // Serve toward whoever just conceded, so they get to defend next.
      e.serveDir = scorer === 'human' ? 1 : -1
      if (e.humanScore >= FIELD.winScore || e.jevScore >= FIELD.winScore) {
        e.status = 'over'
        e.winner = e.humanScore > e.jevScore ? 'human' : 'jev'
        e.ball.vx = 0
        e.ball.vy = 0
      } else {
        e.ball = { x: FIELD.w / 2, y: FIELD.h / 2, vx: 0, vy: 0 }
        e.trail = []
        e.status = 'serving'
      }
    }

    function step(dt: number) {
      const e = engineRef.current

      // Human paddle: keys win over pointer while held.
      if (e.keys.up || e.keys.down) {
        const dir = (e.keys.down ? 1 : 0) - (e.keys.up ? 1 : 0)
        e.humanY = clamp(e.humanY + dir * HUMAN_SPEED * dt, TOP, BOTTOM)
        e.pointerY = null
      } else if (e.pointerY != null) {
        const maxStep = HUMAN_SPEED * dt * 1.7
        e.humanY = clamp(e.humanY + clamp(e.pointerY - e.humanY, -maxStep, maxStep), TOP, BOTTOM)
      }

      // Jev paddle: follow the last typed decision.
      if (e.action === 'MOVE_UP') e.jevY = clamp(e.jevY - JEV_SPEED * dt, TOP, BOTTOM)
      else if (e.action === 'MOVE_DOWN') e.jevY = clamp(e.jevY + JEV_SPEED * dt, TOP, BOTTOM)

      if (e.shake > 0) e.shake = Math.max(0, e.shake - dt * 40)

      // Particles decay regardless of play state.
      for (const p of e.particles) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vy += 400 * dt
        p.life -= dt
      }
      e.particles = e.particles.filter((p) => p.life > 0)

      if (e.status !== 'playing') return

      const b = e.ball
      b.x += b.vx * dt
      b.y += b.vy * dt

      // Trail sampling.
      e.trail.push({ x: b.x, y: b.y })
      if (e.trail.length > 14) e.trail.shift()

      // Top / bottom rails.
      if (b.y - FIELD.ballR < FIELD.wall && b.vy < 0) {
        b.y = FIELD.wall + FIELD.ballR
        b.vy = -b.vy
      } else if (b.y + FIELD.ballR > FIELD.h - FIELD.wall && b.vy > 0) {
        b.y = FIELD.h - FIELD.wall - FIELD.ballR
        b.vy = -b.vy
      }

      // Human paddle (left).
      if (b.vx < 0 && b.x - FIELD.ballR <= HUMAN_FACE_X && b.x > FIELD.paddleInset && Math.abs(b.y - e.humanY) <= FIELD.paddleH / 2 + FIELD.ballR) {
        bounce(e, b, e.humanY, 1, 'var(--human)')
      }
      // Jev paddle (right).
      if (b.vx > 0 && b.x + FIELD.ballR >= JEV_FACE_X && b.x < JEV_FACE_X + FIELD.paddleW && Math.abs(b.y - e.jevY) <= FIELD.paddleH / 2 + FIELD.ballR) {
        bounce(e, b, e.jevY, -1, 'var(--jev)')
      }

      // Out of bounds → point.
      if (b.x < -FIELD.ballR * 3) point('jev')
      else if (b.x > FIELD.w + FIELD.ballR * 3) point('human')
    }

    function bounce(e: Engine, b: Ball, paddleY: number, dir: 1 | -1, color: string) {
      const offset = clamp((b.y - paddleY) / (FIELD.paddleH / 2), -1, 1)
      const speed = Math.min(Math.hypot(b.vx, b.vy) * HIT_ACCEL, BALL_SPEED_MAX)
      b.vx = dir * Math.abs(speed) * 0.86
      b.vy = clamp(b.vy + offset * SPIN, -speed, speed)
      // Renormalize so total speed tracks `speed` after the spin nudge.
      const mag = Math.hypot(b.vx, b.vy) || 1
      b.vx = (b.vx / mag) * speed
      b.vy = (b.vy / mag) * speed
      b.x = dir === 1 ? HUMAN_FACE_X + FIELD.ballR : JEV_FACE_X - FIELD.ballR
      e.rally++
      spark(e, b.x, b.y, color)
    }

    function spark(e: Engine, x: number, y: number, color: string) {
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2
        const s = 60 + Math.random() * 180
        e.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.25, max: 0.55, color })
      }
    }

    // ---------- rendering ----------
    const paints = makePainters(ctx)

    function frame(ts: number) {
      if (!aliveRef.current) return
      const e = engineRef.current
      if (!e.lastTs) e.lastTs = ts
      let dt = (ts - e.lastTs) / 1000
      e.lastTs = ts
      if (dt > 0.05) dt = 0.05 // clamp after tab-switches
      e.accum += dt
      while (e.accum >= STEP) {
        step(STEP)
        e.accum -= STEP
      }

      paints.draw(e)

      // Flush display state ~15x/second.
      e.flush += dt
      if (e.flush >= 0.066) {
        e.flush = 0
        setScores({ human: e.humanScore, jev: e.jevScore, rally: e.rally, ballSpeed: Math.hypot(e.ball.vx, e.ball.vy) })
        setStatus(e.status)
        setWinner(e.winner)
      }

      raf = requestAnimationFrame(frame)
    }
    let raf = requestAnimationFrame(frame)

    return () => {
      aliveRef.current = false
      cancelAnimationFrame(raf)
    }
  }, [])

  // ---------- decision loop ----------
  useEffect(() => {
    let alive = true
    let lastPublish = 0

    async function loop() {
      while (alive) {
        const e = engineRef.current
        if (e.status === 'playing') {
          const state = readState(e)
          const useLocal = preferLocalRef.current || modeRef.current === 'local'
          let dec: JevDecision
          let ms: number | null = null

          if (useLocal) {
            dec = decideLocally(state)
          } else {
            const t0 = performance.now()
            try {
              const res = await fetch('/api/jev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) })
              ms = Math.round(performance.now() - t0)
              if (res.status === 503) {
                modeRef.current = 'local'
                availabilityRef.current = 'nokey'
                setAvailability('nokey')
                dec = decideLocally(state)
              } else if (!res.ok) {
                dec = decideLocally(state) // transient: reflex covers this tick
              } else {
                dec = await res.json()
                if (availabilityRef.current !== 'live') {
                  availabilityRef.current = 'live'
                  setAvailability('live')
                }
              }
            } catch {
              availabilityRef.current = 'offline'
              setAvailability('offline')
              modeRef.current = 'local'
              dec = decideLocally(state)
            }
          }

          e.action = dec.action

          const now = performance.now()
          if (now - lastPublish > 90) {
            lastPublish = now
            setInput(state)
            setDecision(dec)
            setLatency(useLocal ? null : ms)
          }
        }
        // Local reflex is instant, so pace it like a ~14 Hz controller; live Jev
        // is naturally paced by its own latency.
        await sleep(preferLocalRef.current || modeRef.current === 'local' ? 70 : 20)
      }
    }

    loop()
    return () => {
      alive = false
    }
  }, [])

  // ---------- input ----------
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const setKey = (ev: KeyboardEvent, down: boolean) => {
      const e = engineRef.current
      if (ev.key === 'ArrowUp' || ev.key === 'w' || ev.key === 'W') {
        e.keys.up = down
        ev.preventDefault()
      } else if (ev.key === 'ArrowDown' || ev.key === 's' || ev.key === 'S') {
        e.keys.down = down
        ev.preventDefault()
      } else if ((ev.key === ' ' || ev.key === 'Enter') && down) {
        ev.preventDefault()
        if (e.status === 'over') reset()
        else serve()
      }
    }
    const onDown = (ev: KeyboardEvent) => setKey(ev, true)
    const onUp = (ev: KeyboardEvent) => setKey(ev, false)
    wrap.addEventListener('keydown', onDown)
    wrap.addEventListener('keyup', onUp)
    return () => {
      wrap.removeEventListener('keydown', onDown)
      wrap.removeEventListener('keyup', onUp)
    }
  }, [])

  function pointerToField(clientY: number) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return clamp(((clientY - rect.top) / rect.height) * FIELD.h, TOP, BOTTOM)
  }

  const onPointer = (clientY: number) => {
    const y = pointerToField(clientY)
    if (y != null) engineRef.current.pointerY = y
  }

  const brainAvailable = availability === 'live'

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-(--panel-line) bg-(--panel) p-3 shadow-2xl sm:p-4">
        <div className="mb-3 px-1">
          <Scoreboard humanScore={scores.human} jevScore={scores.jev} rally={scores.rally} ballSpeed={scores.ballSpeed} />
        </div>

        <div
          ref={wrapRef}
          tabIndex={0}
          role="application"
          aria-label="Pong game. Move your paddle with the up and down arrow keys, W and S, or by dragging. Press space to serve."
          className="relative touch-none overflow-hidden rounded-xl ring-1 ring-(--panel-line) outline-none focus-visible:ring-2 focus-visible:ring-(--jev)"
          onPointerDown={(ev) => {
            wrapRef.current?.focus()
            ;(ev.target as Element).setPointerCapture?.(ev.pointerId)
            onPointer(ev.clientY)
            if (engineRef.current.status === 'over') reset()
            else serve()
          }}
          onPointerMove={(ev) => {
            if (ev.buttons > 0 || ev.pointerType === 'mouse') onPointer(ev.clientY)
          }}
        >
          <canvas ref={canvasRef} className="block h-auto w-full" style={{ aspectRatio: `${FIELD.w} / ${FIELD.h}` }} />

          {status !== 'playing' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
              <div className="mx-4 max-w-sm rounded-xl border border-(--panel-line) bg-(--panel)/90 px-6 py-5 text-center">
                {status === 'over' ? (
                  <>
                    <div className="text-(length:--text-lg) font-bold" style={{ color: winner === 'human' ? 'var(--human)' : 'var(--jev)' }}>
                      {winner === 'human' ? 'You beat Jev! 🏓' : 'Jev wins.'}
                    </div>
                    <p className="mt-1 text-(length:--text-sm) text-(--ink-dim)">
                      {winner === 'human' ? 'A System One model, out-reflexed. Share the receipt.' : 'Two orders of magnitude faster, and it shows. Rematch?'}
                    </p>
                    <button onClick={reset} className="mt-4 rounded-lg bg-(--jev) px-4 py-2 text-(length:--text-sm) font-semibold text-black transition-transform hover:scale-[1.03]">
                      Play again
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-(length:--text-lg) font-bold text-(--ink)">{status === 'idle' ? 'Human vs Jev' : 'Point!'}</div>
                    <p className="mt-1 text-(length:--text-sm) text-(--ink-dim)">Drag, or use ↑ ↓ / W S. Press space or tap to serve.</p>
                    <button onClick={serve} className="mt-4 rounded-lg bg-(--jev) px-4 py-2 text-(length:--text-sm) font-semibold text-black transition-transform hover:scale-[1.03]">
                      Serve
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Availability line + optional compare toggle. */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-(length:--text-xs) text-(--ink-faint)">
          <span>
            {availability === 'nokey'
              ? 'No TYPESAFE_API_KEY set — Jev is running as a local System One reflex.'
              : availability === 'offline'
                ? 'Network hiccup — Jev fell back to the local reflex.'
                : availability === 'live'
                  ? 'Right paddle is calling live Jev on api.typesafe.ai.'
                  : 'Warming up the opponent…'}
          </span>
          {brainAvailable ? (
            <label className="inline-flex cursor-pointer items-center gap-2 select-none">
              <input
                type="checkbox"
                className="accent-(--jev)"
                onChange={(ev) => {
                  preferLocalRef.current = ev.target.checked
                }}
              />
              compare local reflex
            </label>
          ) : null}
        </div>
      </div>

      <TelemetryPanel input={input} decision={decision} latencyMs={latency} />
    </div>
  )
}

/**
 * Build the canvas painters once. Everything is drawn every frame in logical
 * coordinates; the table itself is static enough that we could cache it, but at
 * 900×560 the full repaint is cheap and keeps the code a single pass.
 */
function makePainters(ctx: CanvasRenderingContext2D) {
  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
  }

  function table() {
    // Wooden frame.
    const wood = ctx.createLinearGradient(0, 0, 0, FIELD.h)
    wood.addColorStop(0, '#8a5528')
    wood.addColorStop(0.5, '#6f4420')
    wood.addColorStop(1, '#553417')
    ctx.fillStyle = wood
    roundRect(0, 0, FIELD.w, FIELD.h, 18)
    ctx.fill()

    // Playing surface.
    const inset = 8
    const surf = ctx.createLinearGradient(0, 0, FIELD.w, FIELD.h)
    surf.addColorStop(0, '#1c63b8')
    surf.addColorStop(0.5, '#1657a8')
    surf.addColorStop(1, '#124a92')
    ctx.fillStyle = surf
    roundRect(inset, inset, FIELD.w - inset * 2, FIELD.h - inset * 2, 12)
    ctx.fill()

    // Soft center sheen (overhead light).
    const sheen = ctx.createRadialGradient(FIELD.w / 2, FIELD.h / 2, 40, FIELD.w / 2, FIELD.h / 2, FIELD.w / 1.4)
    sheen.addColorStop(0, 'rgba(255,255,255,0.14)')
    sheen.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = sheen
    roundRect(inset, inset, FIELD.w - inset * 2, FIELD.h - inset * 2, 12)
    ctx.fill()

    // Boundary line.
    ctx.strokeStyle = 'rgba(234,241,251,0.9)'
    ctx.lineWidth = 3
    roundRect(FIELD.wall, FIELD.wall, FIELD.w - FIELD.wall * 2, FIELD.h - FIELD.wall * 2, 4)
    ctx.stroke()

    // Center (doubles) line running along the length of play.
    ctx.save()
    ctx.strokeStyle = 'rgba(234,241,251,0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(FIELD.wall, FIELD.h / 2)
    ctx.lineTo(FIELD.w - FIELD.wall, FIELD.h / 2)
    ctx.stroke()
    ctx.restore()

    // Faint side labels.
    ctx.save()
    ctx.fillStyle = 'rgba(234,241,251,0.10)'
    ctx.font = '700 64px ' + FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('YOU', FIELD.w * 0.26, FIELD.h / 2)
    ctx.fillText('JEV', FIELD.w * 0.74, FIELD.h / 2)
    ctx.restore()

    net()
  }

  function net() {
    const cx = FIELD.w / 2
    // Post shadows / posts just outside the rails.
    ctx.save()
    // Mesh band.
    const bandW = 12
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.fillRect(cx - bandW / 2, FIELD.wall, bandW, FIELD.h - FIELD.wall * 2)
    // Vertical mesh strings.
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.lineWidth = 1
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath()
      ctx.moveTo(cx + i * 3, FIELD.wall)
      ctx.lineTo(cx + i * 3, FIELD.h - FIELD.wall)
      ctx.stroke()
    }
    // Horizontal mesh strings.
    for (let y = FIELD.wall; y <= FIELD.h - FIELD.wall; y += 9) {
      ctx.beginPath()
      ctx.moveTo(cx - bandW / 2, y)
      ctx.lineTo(cx + bandW / 2, y)
      ctx.stroke()
    }
    // Taut white top cord + posts.
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx - bandW / 2 - 3, FIELD.wall - 2)
    ctx.lineTo(cx + bandW / 2 + 3, FIELD.wall - 2)
    ctx.moveTo(cx - bandW / 2 - 3, FIELD.h - FIELD.wall + 2)
    ctx.lineTo(cx + bandW / 2 + 3, FIELD.h - FIELD.wall + 2)
    ctx.stroke()
    ctx.restore()
  }

  function ballShadow(b: Ball) {
    ctx.save()
    ctx.fillStyle = 'rgba(4,12,24,0.30)'
    ctx.beginPath()
    ctx.ellipse(b.x + 7, b.y + 10, FIELD.ballR * 1.15, FIELD.ballR * 0.7, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  function trail(points: { x: number; y: number }[]) {
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const t = i / points.length
      ctx.fillStyle = `rgba(253,253,245,${t * 0.28})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, FIELD.ballR * (0.4 + t * 0.6), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function ball(b: Ball) {
    ctx.save()
    ctx.shadowColor = 'rgba(255,255,255,0.55)'
    ctx.shadowBlur = 14
    const g = ctx.createRadialGradient(b.x - 3, b.y - 4, 1, b.x, b.y, FIELD.ballR)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.6, '#fdfdf3')
    g.addColorStop(1, '#e7e3cf')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(b.x, b.y, FIELD.ballR, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  function ellipse(cx: number, cy: number, rx: number, ry: number) {
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  }

  /**
   * An actual table-tennis racket: a wooden handle, a wooden blade edge, and a
   * shaded rubber face. `faceX` is the ball-contact line (so the rubber sits
   * exactly where the collision happens) and `side` decides which way the
   * handle points — outward, toward the near rail. The hit column is still the
   * same thin logical bar; only the drawing changed.
   */
  function racket(faceX: number, cy: number, side: 'left' | 'right', rubber: string, glow: string) {
    const out = side === 'left' ? -1 : 1 // direction the handle points
    const bRx = 22
    const bRy = 52
    const rim = 4
    const cx = faceX + out * (bRx - 2) // blade center; inner rubber edge lands on faceX

    ctx.save()

    // Contact shadow on the table, offset toward the light.
    ctx.fillStyle = 'rgba(4,12,24,0.22)'
    ellipse(cx + 6, cy + 9, bRx, bRy)
    ctx.fill()

    // Handle (behind the blade), a rounded wooden grip flaring into the neck.
    const hW = 19
    const hLen = 30
    const hStart = cx + out * (bRx - 6)
    const hEnd = cx + out * (bRx + hLen)
    const hx = Math.min(hStart, hEnd)
    const hw = Math.abs(hEnd - hStart)
    const hg = ctx.createLinearGradient(hx, cy - hW / 2, hx, cy + hW / 2)
    hg.addColorStop(0, '#9c6a38')
    hg.addColorStop(0.5, '#6b4320')
    hg.addColorStop(1, '#4a2f15')
    ctx.fillStyle = hg
    roundRect(hx, cy - hW / 2, hw, hW, 7)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'
    ctx.lineWidth = 1
    roundRect(hx, cy - hW / 2, hw, hW, 7)
    ctx.stroke()

    // Wooden blade backing (a thin edge shows around the rubber), with glow.
    ctx.shadowColor = glow
    ctx.shadowBlur = 22
    const wg = ctx.createLinearGradient(cx, cy - bRy, cx, cy + bRy)
    wg.addColorStop(0, '#d29a55')
    wg.addColorStop(1, '#8a5a2e')
    ctx.fillStyle = wg
    ellipse(cx, cy, bRx, bRy)
    ctx.fill()
    ctx.shadowBlur = 0

    // Rubber face — matte with a soft center sheen.
    const rr = ctx.createRadialGradient(cx - out * 4, cy - 12, 3, cx, cy, bRy)
    rr.addColorStop(0, shade(rubber, 1.2))
    rr.addColorStop(0.55, rubber)
    rr.addColorStop(1, shade(rubber, 0.72))
    ctx.fillStyle = rr
    ellipse(cx, cy, bRx - rim, bRy - rim)
    ctx.fill()

    // Specular highlight near the top of the face.
    ctx.fillStyle = 'rgba(255,255,255,0.20)'
    ellipse(cx - out * 5, cy - bRy * 0.42, (bRx - rim) * 0.5, (bRy - rim) * 0.26)
    ctx.fill()

    // Rim line on the rubber.
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = 1
    ellipse(cx, cy, bRx - rim, bRy - rim)
    ctx.stroke()

    ctx.restore()
  }

  function particles(list: Particle[]) {
    for (const p of list) {
      const a = Math.max(0, p.life / p.max)
      ctx.fillStyle = p.color === 'var(--human)' ? `rgba(239,68,68,${a})` : `rgba(45,212,191,${a})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.2 * a + 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function draw(e: Engine) {
    ctx.clearRect(0, 0, FIELD.w, FIELD.h)
    ctx.save()
    if (e.shake > 0) ctx.translate((Math.random() * 2 - 1) * e.shake, (Math.random() * 2 - 1) * e.shake)

    table()
    if (e.status === 'playing') {
      ballShadow(e.ball)
      trail(e.trail)
    }
    racket(HUMAN_FACE_X, e.humanY, 'left', '#ef4444', 'rgba(239,68,68,0.5)')
    racket(JEV_FACE_X, e.jevY, 'right', '#2dd4bf', 'rgba(45,212,191,0.55)')
    particles(e.particles)
    if (e.status !== 'idle') ball(e.ball)

    ctx.restore()
  }

  return { draw }
}

const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

/** Lighten (>1) or darken (<1) a #rrggbb color by a factor. */
function shade(hex: string, factor: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const c = [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)].map((v) => clamp(Math.round(v * factor), 0, 255))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}
