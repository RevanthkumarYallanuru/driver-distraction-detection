import type { AlertLogEntry, Announcement, ConnectionState, SystemEvent, Telemetry } from '../types/telemetry'

export interface DashboardState {
  connection: ConnectionState
  telemetry: Telemetry | null
  events: SystemEvent[]
  alerts: AlertLogEntry[]
  unreadAlerts: number
  announcement: Announcement | null
  /** Recent EAR samples (NaN = no face) for the sparkline. */
  earHistory: number[]
}

const MAX_EVENTS = 50
const MAX_ALERTS = 50
const EAR_SAMPLES = 90 // ~9 s at 10 Hz

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
    alerts: [],
    unreadAlerts: 0,
    announcement: null,
    earHistory: [],
  }
  private listeners = new Set<() => void>()

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
    const sample = telemetry.ear ?? Number.NaN
    this.set({
      telemetry,
      earHistory: [...this.state.earHistory, sample].slice(-EAR_SAMPLES),
    })
  }

  setHistory(events: SystemEvent[], alerts: AlertLogEntry[]) {
    this.set({
      events: events.slice(-MAX_EVENTS).reverse(),
      alerts: alerts.slice(-MAX_ALERTS).reverse(),
    })
  }

  addEvent(event: SystemEvent) {
    if (this.state.events.some((e) => e.id === event.id)) return
    this.set({ events: [event, ...this.state.events].slice(0, MAX_EVENTS) })
  }

  addAlert(alert: AlertLogEntry) {
    if (this.state.alerts.some((a) => a.id === alert.id)) return
    this.set({
      alerts: [alert, ...this.state.alerts].slice(0, MAX_ALERTS),
      unreadAlerts: alert.level === 'INFO' ? this.state.unreadAlerts : this.state.unreadAlerts + 1,
    })
  }

  markAlertsRead() {
    if (this.state.unreadAlerts) this.set({ unreadAlerts: 0 })
  }

  setAnnouncement(announcement: Announcement | null) {
    this.set({ announcement })
  }
}

export const telemetryStore = new TelemetryStore()
