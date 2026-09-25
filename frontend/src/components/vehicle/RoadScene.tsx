import { memo, useEffect, useRef } from 'react'
import { telemetryStore } from '../../services/telemetryStore'

// World units are metres. The camera sits in the middle lane of a
// three-lane road; everything is projected with a simple pinhole model.
const CAM_HEIGHT = 1.25
const Z_NEAR = 3.2
const Z_FAR = 160
const HORIZON = 0.44          // horizon height as a fraction of the canvas
const ROAD_EDGE = 5.6
const LANE_LINES = [-1.85, 1.85]
const DASH_LEN = 3
const DASH_PERIOD = 10
const LAMP_X = 8.2
const LAMP_HEIGHT = 7.5
const LAMP_PERIOD = 32
const BRAKING = new Set(['SLOWING', 'STOPPING', 'STOPPED'])

/**
 * First-person night road. Lane markings and street lamps stream toward
 * the viewer at the simulated speed; brake glow appears while slowing.
 * Drawn on a canvas in a rAF loop that reads the store directly, so it
 * never causes React re-renders.
 */
export const RoadScene = memo(function RoadScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let w = 0
    let h = 0
    let last = performance.now()
    let travelled = 0
    let shown = telemetryStore.getState().telemetry?.speed ?? 0
    let brake = 0
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    // Deterministic skyline lights
    const lights = Array.from({ length: 70 }, (_, i) => {
      const r = Math.sin(i * 12.9898) * 43758.5453
      const f = r - Math.floor(r)
      const g = Math.sin(i * 78.233) * 12345.678
      return { x: f, y: g - Math.floor(g), warm: i % 3 !== 0 }
    })

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now

      const state = telemetryStore.getState()
      const t = state.telemetry
      const live = state.connection === 'open' && t !== null
      shown += ((live ? t!.speed : 0) - shown) * Math.min(1, dt * 5)
      if (!reduced) travelled += (shown / 3.6) * dt * 1.6 // slightly exaggerated for readability
      const braking = live && BRAKING.has(t!.base_status)
      brake += ((braking ? 1 : 0) - brake) * Math.min(1, dt * 4)

      const hy = h * HORIZON
      const cx = w / 2
      const focal = ((h - hy) * Z_NEAR) / CAM_HEIGHT
      const sx = (x: number, z: number) => cx + (x * focal) / z
      const sy = (height: number, z: number) => hy + ((CAM_HEIGHT - height) * focal) / z

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, hy)
      sky.addColorStop(0, '#040a14')
      sky.addColorStop(1, '#0d1b30')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, hy + 1)

      // Warm city glow on the horizon
      const glow = ctx.createRadialGradient(cx, hy, 0, cx, hy, w * 0.55)
      glow.addColorStop(0, 'rgba(255,170,90,0.28)')
      glow.addColorStop(0.4, 'rgba(255,140,70,0.08)')
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, hy + 2)

      // Distant city lights
      for (const l of lights) {
        ctx.fillStyle = l.warm ? 'rgba(255,196,120,0.65)' : 'rgba(150,210,255,0.5)'
        ctx.fillRect(l.x * w, hy - 4 - l.y * h * 0.07, 1.4, 1.4)
      }

      // Ground & road surface
      ctx.fillStyle = '#050a12'
      ctx.fillRect(0, hy, w, h - hy)
      ctx.beginPath()
      ctx.moveTo(sx(-ROAD_EDGE, Z_FAR), sy(0, Z_FAR))
      ctx.lineTo(sx(ROAD_EDGE, Z_FAR), sy(0, Z_FAR))
      ctx.lineTo(sx(ROAD_EDGE, Z_NEAR * 0.6), sy(0, Z_NEAR * 0.6))
      ctx.lineTo(sx(-ROAD_EDGE, Z_NEAR * 0.6), sy(0, Z_NEAR * 0.6))
      ctx.closePath()
      const road = ctx.createLinearGradient(0, hy, 0, h)
      road.addColorStop(0, '#1a2332')
      road.addColorStop(1, '#0b111b')
      ctx.fillStyle = road
      ctx.fill()

      // Solid road edges
      ctx.strokeStyle = 'rgba(230,236,245,0.75)'
      for (const x of [-ROAD_EDGE + 0.2, ROAD_EDGE - 0.2]) {
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(sx(x, Z_FAR), sy(0, Z_FAR))
        ctx.lineTo(sx(x, Z_NEAR * 0.6), sy(0, Z_NEAR * 0.6))
        ctx.stroke()
      }

      // Dashed lane lines streaming toward the viewer
      const phase = travelled % DASH_PERIOD
      for (let z0 = Z_NEAR * 0.6 - phase; z0 < Z_FAR; z0 += DASH_PERIOD) {
        const za = Math.max(Z_NEAR * 0.6, z0)
        const zb = z0 + DASH_LEN
        if (zb <= za) continue
        const alpha = Math.max(0, 1 - za / Z_FAR) * 0.9
        ctx.fillStyle = `rgba(240,244,250,${alpha})`
        for (const x of LANE_LINES) {
          const half = 0.07
          ctx.beginPath()
          ctx.moveTo(sx(x - half, za), sy(0, za))
          ctx.lineTo(sx(x + half, za), sy(0, za))
          ctx.lineTo(sx(x + half, zb), sy(0, zb))
          ctx.lineTo(sx(x - half, zb), sy(0, zb))
          ctx.closePath()
          ctx.fill()
        }
      }

      // Street lamps on both sides (far to near so near ones draw on top)
      const lampPhase = travelled % LAMP_PERIOD
      const lamps: number[] = []
      for (let z = Z_NEAR - lampPhase + LAMP_PERIOD; z < Z_FAR; z += LAMP_PERIOD) lamps.push(z)
      lamps.reverse()
      for (const z of lamps) {
        const fade = Math.max(0, 1 - z / Z_FAR)
        for (const side of [-1, 1]) {
          const baseX = sx(side * LAMP_X, z)
          const topY = sy(LAMP_HEIGHT, z)
          const armX = sx(side * (LAMP_X - 1.6), z)
          ctx.strokeStyle = `rgba(90,110,135,${0.9 * fade})`
          ctx.lineWidth = Math.max(1, (0.18 * focal) / z)
          ctx.beginPath()
          ctx.moveTo(baseX, sy(0, z))
          ctx.lineTo(baseX, topY)
          ctx.lineTo(armX, topY)
          ctx.stroke()
          const r = Math.max(2, (2.4 * focal) / z)
          const lamp = ctx.createRadialGradient(armX, topY, 0, armX, topY, r * 3)
          lamp.addColorStop(0, `rgba(255,214,150,${0.95 * fade})`)
          lamp.addColorStop(0.25, `rgba(255,190,110,${0.35 * fade})`)
          lamp.addColorStop(1, 'rgba(255,170,90,0)')
          ctx.fillStyle = lamp
          ctx.fillRect(armX - r * 3, topY - r * 3, r * 6, r * 6)
        }
      }

      // Brake glow (simulated vehicle slowing)
      if (brake > 0.02) {
        const g = ctx.createLinearGradient(0, h, 0, h * 0.62)
        g.addColorStop(0, `rgba(244,63,94,${0.38 * brake})`)
        g.addColorStop(1, 'rgba(244,63,94,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, h * 0.62, w, h * 0.38)
      }

      // Bottom vignette to seat the gauge
      const v = ctx.createLinearGradient(0, h * 0.45, 0, h)
      v.addColorStop(0, 'rgba(5,12,24,0)')
      v.addColorStop(1, 'rgba(5,12,24,0.72)')
      ctx.fillStyle = v
      ctx.fillRect(0, h * 0.45, w, h * 0.55)

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
})
