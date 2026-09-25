import { useSyncExternalStore } from 'react'
import { telemetryStore, type DashboardState } from '../services/telemetryStore'
import type { Telemetry } from '../types/telemetry'

/** Subscribe to a slice of dashboard state. Selectors must return primitives or existing references. */
export function useDashboard<T>(selector: (state: DashboardState) => T): T {
  return useSyncExternalStore(telemetryStore.subscribe, () => selector(telemetryStore.getState()))
}

/** Shorthand for a single telemetry field (undefined until the first message). */
export function useTelemetry<K extends keyof Telemetry>(key: K): Telemetry[K] | undefined {
  return useDashboard((s) => s.telemetry?.[key])
}
