import type { ServerMessage } from '../types/telemetry'
import { telemetryStore } from './telemetryStore'
import { WS_URL } from './config'

const STALE_AFTER_MS = 2500
const PING_EVERY_MS = 15000
const MAX_BACKOFF_MS = 5000

/**
 * Single WebSocket connection to the backend with automatic reconnect.
 * Pushes every message straight into the telemetry store (no polling).
 */
export function startTelemetrySocket(): () => void {
  let socket: WebSocket | null = null
  let stopped = false
  let backoff = 500
  let lastMessageAt = 0
  let reconnectTimer: number | undefined

  const watchdog = window.setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      const stale = Date.now() - lastMessageAt > STALE_AFTER_MS
      telemetryStore.setConnection(stale ? 'stale' : 'open')
    }
  }, 500)

  const ping = window.setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) socket.send('ping')
  }, PING_EVERY_MS)

  const handle = (message: ServerMessage) => {
    switch (message.type) {
      case 'telemetry':
        telemetryStore.setTelemetry(message)
        break
      case 'event':
        telemetryStore.addEvent(message)
        break
      case 'announcement':
        telemetryStore.setAnnouncement(message.announcement)
        break
      case 'hello':
        telemetryStore.setEvents(message.events)
        break
    }
  }

  const connect = () => {
    if (stopped) return
    telemetryStore.setConnection('connecting')
    socket = new WebSocket(WS_URL)

    socket.onopen = () => {
      backoff = 500
      lastMessageAt = Date.now()
      telemetryStore.setConnection('open')
    }

    socket.onmessage = (event) => {
      lastMessageAt = Date.now()
      try {
        handle(JSON.parse(event.data) as ServerMessage)
      } catch (error) {
        console.warn('Bad telemetry message', error)
      }
    }

    socket.onclose = () => {
      if (stopped) return
      telemetryStore.setConnection('closed')
      reconnectTimer = window.setTimeout(connect, backoff)
      backoff = Math.min(MAX_BACKOFF_MS, backoff * 2)
    }

    socket.onerror = () => socket?.close()
  }

  connect()

  return () => {
    stopped = true
    window.clearInterval(watchdog)
    window.clearInterval(ping)
    window.clearTimeout(reconnectTimer)
    socket?.close()
  }
}
