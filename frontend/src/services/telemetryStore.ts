import type { Announcement, ConnectionState, SystemEvent, Telemetry } from '../types/telemetry'

export interface SpeedSample {
  t: number
  speed: number
  target: number
}

export interface DashboardState {
  connection: ConnectionState
  telemetry: Telemetry | null
  events: SystemEvent[]
  announcement: Announcement | null
  speedHistory: SpeedSample[]
}

const MAX_EVENTS = 40
const HISTORY_SECONDS = 60
const HISTORY_INTERVAL_MS = 500

/**
 * Tiny external store. Components subscribe through useDashboard(selector)
 * and only re-render when their selected slice changes, which keeps
 * 10 Hz telemetry cheap.
 */
class TelemetryStore {
  private state: DashboardState = {
    connection: 'connecting',
    telemetry: null,
    events: [],
    announcement: null,
    speedHistory: [],
  }
  private listeners = new Set<() => void>()
  private lastSampleAt = 0

  getState = () => this.state

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private set(patch: Partial<DashboardState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  setConnection(connection: ConnectionState) {
    if (connection !== this.state.connection) this.set({ connection })
  }

  setTelemetry(telemetry: Telemetry) {
    const patch: Partial<DashboardState> = { telemetry }
    const now = Date.now()
    if (now - this.lastSampleAt >= HISTORY_INTERVAL_MS) {
      this.lastSampleAt = now
      const cutoff = now - HISTORY_SECONDS * 1000
      patch.speedHistory = [
        ...this.state.speedHistory.filter((s) => s.t >= cutoff),
        { t: now, speed: telemetry.speed, target: telemetry.target_speed },
      ]
    }
    this.set(patch)
  }

  setEvents(events: SystemEvent[]) {
    this.set({ events: events.slice(-MAX_EVENTS).reverse() })
  }

  addEvent(event: SystemEvent) {
    if (this.state.events.some((e) => e.id === event.id)) return
    this.set({ events: [event, ...this.state.events].slice(0, MAX_EVENTS) })
  }

  setAnnouncement(announcement: Announcement | null) {
    this.set({ announcement })
  }
}

export const telemetryStore = new TelemetryStore()
