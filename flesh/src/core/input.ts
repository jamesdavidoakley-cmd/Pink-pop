/**
 * Keyboard, mouse and touch, turned into one frame of intent.
 *
 * The simulation never sees an event. It gets an `InputFrame` — a plain
 * snapshot of what the player is asking for this tick — which is why the same
 * simulation can be driven by a bot in a headless test without any of this
 * existing.
 */

import type { InputFrame } from '@/sim/types'

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'sprint'
  | 'jump'
  | 'aim'
  | 'fire'
  | 'goad'
  | 'whoop'
  | 'mount'
  | 'net'
  | 'boomer'
  | 'map'
  | 'pause'
  | 'mute'

/** The default bindings, as set out in §4 of the brief. */
const KEY_MAP: Record<string, Action> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
  KeyE: 'goad',
  KeyQ: 'whoop',
  KeyF: 'mount',
  // The two bought weapons. Not in the brief's control list, so they go
  // somewhere reachable without letting go of WASD.
  KeyR: 'net',
  KeyC: 'boomer',
  Tab: 'map',
  Escape: 'pause',
  KeyM: 'mute',
}

export interface LookDelta {
  yaw: number
  pitch: number
}

export class InputManager {
  private held = new Set<Action>()
  private edges = new Set<Action>()
  private lookX = 0
  private lookY = 0
  private attached: HTMLElement | null = null
  /** Set while the pointer is locked; otherwise the mouse does not turn the camera. */
  locked = false
  /**
   * False whenever a menu is up.
   *
   * Without this the manager keeps listening behind the pause screen, and its
   * mousedown handler grabs pointer lock the instant you press a button — which
   * moves the cursor out from under the mouseup, so the click never completes
   * and the button does nothing. The pause menu was effectively unusable.
   */
  private enabled = true
  sensitivity = 0.0022
  invertY = false

  /* --------------------------------------------------------- touch state */
  touchStick = { active: false, x: 0, y: 0 }
  touchFire = false
  touchAim = false

  attach(el: HTMLElement): void {
    this.detach()
    this.attached = el
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    el.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('mousemove', this.onMouseMove)
    el.addEventListener('contextmenu', this.onContextMenu)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
  }

  detach(): void {
    const el = this.attached
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    if (el) {
      el.removeEventListener('mousedown', this.onMouseDown)
      el.removeEventListener('contextmenu', this.onContextMenu)
    }
    this.attached = null
    this.held.clear()
    this.edges.clear()
  }

  /** Menus call this. Disabled means: no input, and no grabbing the pointer. */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return
    this.enabled = enabled
    if (!enabled) {
      this.held.clear()
      this.edges.clear()
      this.lookX = 0
      this.lookY = 0
    }
  }

  requestLock(): void {
    if (!this.enabled) return
    this.attached?.requestPointerLock?.()
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  /* ------------------------------------------------------------ handlers */

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return
    const action = KEY_MAP[e.code]
    if (!action) return
    // Tab would otherwise walk the focus ring off the canvas mid-drive.
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault()
    if (!this.held.has(action)) this.edges.add(action)
    this.held.add(action)
  }

  private onKeyUp = (e: KeyboardEvent) => {
    const action = KEY_MAP[e.code]
    if (action) this.held.delete(action)
  }

  private onBlur = () => {
    // Alt-tabbing away must not leave him sprinting into a canyon.
    this.held.clear()
  }

  private onMouseDown = (e: MouseEvent) => {
    if (!this.enabled) return
    if (e.button === 0) {
      this.held.add('fire')
      this.edges.add('fire')
      if (!this.locked) this.requestLock()
    }
    if (e.button === 2) this.held.add('aim')
  }

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.held.delete('fire')
    if (e.button === 2) this.held.delete('aim')
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || !this.enabled) return
    this.lookX += e.movementX
    this.lookY += e.movementY
  }

  private onContextMenu = (e: Event) => {
    if (this.enabled) e.preventDefault()
  }

  private onPointerLockChange = () => {
    this.locked = document.pointerLockElement === this.attached
    if (!this.locked) this.held.clear()
  }

  /* -------------------------------------------------------------- output */

  /** Consume the mouse movement accumulated since the last call. */
  takeLook(): LookDelta {
    const yaw = -this.lookX * this.sensitivity
    const pitch = (this.invertY ? this.lookY : -this.lookY) * this.sensitivity
    this.lookX = 0
    this.lookY = 0
    return { yaw, pitch }
  }

  /**
   * True once, on the frame the action was pressed. Jump, goad, whoop, mount,
   * the two bought weapons, the map, pause and mute are all edge-triggered:
   * holding the key does not repeat them.
   */
  pressed(action: Action): boolean {
    return this.edges.has(action)
  }

  /** Fire an edge-triggered action from an on-screen button. */
  pressVirtual(action: Action): void {
    this.edges.add(action)
  }

  isHeld(action: Action): boolean {
    if (action === 'fire' && this.touchFire) return true
    if (action === 'aim' && this.touchAim) return true
    return this.held.has(action)
  }

  /** Call once per rendered frame, after building the input frame. */
  endFrame(): void {
    this.edges.clear()
  }

  /**
   * Build one tick of intent. `cameraYaw` turns the raw WASD into a world
   * direction, because "forward" means "away from the camera", not "north".
   */
  buildFrame(cameraYaw: number, aimYaw: number, aimPitch: number): InputFrame {
    let fwd = 0
    let strafe = 0
    if (this.isHeld('forward')) fwd += 1
    if (this.isHeld('back')) fwd -= 1
    if (this.isHeld('right')) strafe += 1
    if (this.isHeld('left')) strafe -= 1

    if (this.touchStick.active) {
      fwd += -this.touchStick.y
      strafe += this.touchStick.x
    }

    // forward = (sin yaw, cos yaw); right = (-cos yaw, sin yaw).
    const s = Math.sin(cameraYaw)
    const c = Math.cos(cameraYaw)
    let moveX = fwd * s - strafe * c
    let moveZ = fwd * c + strafe * s
    const len = Math.hypot(moveX, moveZ)
    if (len > 1) {
      moveX /= len
      moveZ /= len
    }

    return {
      moveX,
      moveZ,
      sprint: this.isHeld('sprint'),
      jump: this.pressed('jump'),
      jumpHeld: this.isHeld('jump'),
      aim: this.isHeld('aim'),
      fire: this.isHeld('fire'),
      goad: this.pressed('goad'),
      whoop: this.pressed('whoop'),
      mount: this.pressed('mount'),
      net: this.pressed('net'),
      boomer: this.pressed('boomer'),
      aimYaw,
      aimPitch,
    }
  }
}

/** The controls list, shown on the pause screen and in the commissary. */
export const CONTROL_HELP: { keys: string; what: string }[] = [
  { keys: 'W A S D', what: 'Move' },
  { keys: 'Mouse', what: 'Look' },
  { keys: 'Shift', what: 'Sprint (drains stamina)' },
  { keys: 'Space', what: 'Jump — hold for height' },
  { keys: 'Left click', what: 'Fire stun rifle' },
  { keys: 'Right click', what: 'Hold to aim over the shoulder' },
  { keys: 'E', what: 'Goad — a wide forward shove' },
  { keys: 'Q', what: 'Whoop — the gather call' },
  { keys: 'F', what: 'Mount / dismount hover bike' },
  { keys: 'R', what: 'Net gun (if bought)' },
  { keys: 'C', what: 'Sonic boomer (if bought)' },
  { keys: 'Tab', what: 'Herd map' },
  { keys: 'M', what: 'Mute' },
  { keys: 'Esc', what: 'Pause' },
]
