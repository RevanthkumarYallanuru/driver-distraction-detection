import { useMotionValue, useSpring, type MotionValue } from 'framer-motion'
import { useEffect } from 'react'
import { telemetryStore, type DashboardState } from '../services/telemetryStore'

/**
 * A spring-smoothed MotionValue fed straight from the store, so gauges and
 * readouts animate between 10 Hz samples without React re-renders.
 */
export function useAnimatedValue(
  select: (s: DashboardState) => number | null | undefined,
  spring = { stiffness: 120, damping: 24, mass: 0.6 },
): MotionValue<number> {
  const raw = useMotionValue(select(telemetryStore.getState()) ?? 0)
  const smooth = useSpring(raw, spring)

  useEffect(
    () =>
      telemetryStore.subscribe(() => {
        const v = select(telemetryStore.getState())
        if (v !== null && v !== undefined && v !== raw.get()) raw.set(v)
      }),
    // `select` must be a stable, module-level function (see exports below).
    [raw],
  )

  return smooth
}

export const selectSpeed = (s: DashboardState) => s.telemetry?.speed
export const selectAttention = (s: DashboardState) => s.telemetry?.attention.score
export const selectSeverity = (s: DashboardState) => s.telemetry?.severity.score
