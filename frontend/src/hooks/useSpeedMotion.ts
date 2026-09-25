import { useMotionValue, useSpring, type MotionValue } from 'framer-motion'
import { useEffect } from 'react'
import { telemetryStore } from '../services/telemetryStore'

/**
 * Speed as a spring-smoothed MotionValue fed straight from the store,
 * so readouts animate between 10 Hz samples without React re-renders.
 */
export function useSpeedMotion(): MotionValue<number> {
  const raw = useMotionValue(telemetryStore.getState().telemetry?.speed ?? 0)
  const smooth = useSpring(raw, { stiffness: 120, damping: 24, mass: 0.6 })

  useEffect(
    () =>
      telemetryStore.subscribe(() => {
        const t = telemetryStore.getState().telemetry
        if (t && t.speed !== raw.get()) raw.set(t.speed)
      }),
    [raw],
  )

  return smooth
}
