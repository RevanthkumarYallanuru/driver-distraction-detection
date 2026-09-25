export type VehicleStatus =
  | 'MOVING'
  | 'SLOWING'
  | 'SLOWED'
  | 'STOPPING'
  | 'STOPPED'
  | 'ACCELERATING'
  | 'HORNED'
  | 'WARNING'

export type DriverStatus = 'NORMAL' | 'DISTRACTED' | 'DROWSY' | 'CRITICAL' | 'NO FACE' | 'UNKNOWN'
export type HeadDirection = 'CENTER' | 'LEFT' | 'RIGHT' | 'UNKNOWN'
export type AlertLevel = 'NORMAL' | 'INFO' | 'WARNING' | 'CRITICAL'
export type Condition = 'DROWSINESS' | 'PHONE' | 'LOOKING_AWAY'
export type AlertType = Condition | 'CRITICAL' | 'ATTENTION_RESTORED'
export type AiStatus = 'STARTING' | 'ONLINE' | 'DEGRADED' | 'PAUSED' | 'OFFLINE'
export type SystemStatus = 'STARTING' | 'ACTIVE' | 'DEGRADED' | 'PAUSED'

export interface PhoneBox {
  x1: number
  y1: number
  x2: number
  y2: number
  confidence: number
}

export interface Telemetry {
  type: 'telemetry'
  timestamp: string

  speed: number
  target_speed: number
  vehicle_status: VehicleStatus
  base_status: VehicleStatus
  horn_active: boolean
  normal_speed: number
  reduced_speed: number

  driver_status: DriverStatus
  head_direction: HeadDirection
  ear: number | null
  ear_threshold: number
  eyes_state: 'OPEN' | 'CLOSED' | 'UNKNOWN'
  face_detected: boolean
  phone_visible: boolean
  phone_confidence: number | null
  phone_detected: boolean
  drowsiness_detected: boolean
  looking_away: boolean
  distraction_detected: boolean
  active_conditions: Condition[]
  condition_progress: Partial<Record<Condition, number>>

  alert_type: AlertType | null
  alert_message: string | null
  alert_level: AlertLevel
  last_alert: { type: AlertType; title: string; timestamp: string } | null

  system_status: SystemStatus
  camera: { connected: boolean; fps: number; error: string | null }
  ai: {
    status: AiStatus
    messages: string[]
    fps: number
    inference_ms: number
    face_model: boolean
    phone_model: boolean
    simulated: Condition[]
  }
  voice: { enabled: boolean; speaking: boolean; error: string | null }
  overlay: {
    frame_width: number
    frame_height: number
    eye_points: [number, number][]
    pose_points: [number, number][]
    face_box: [number, number, number, number] | null
    phone_boxes: PhoneBox[]
  }
}

export interface Announcement {
  id: number
  type: AlertType
  level: AlertLevel
  severity: number
  title: string
  message: string
  voice: string | null
  spoken: boolean
  conditions: Condition[]
  timestamp: string
  detail: string | null
}

export interface SystemEvent {
  type: 'event'
  id: number
  kind: string
  message: string
  level: AlertLevel
  timestamp: string
}

export type ServerMessage =
  | Telemetry
  | SystemEvent
  | { type: 'announcement'; announcement: Announcement }
  | { type: 'hello'; events: SystemEvent[]; announcement: Announcement | null }

export type ConnectionState = 'connecting' | 'open' | 'stale' | 'closed'
