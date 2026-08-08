/** Keyboard + gamepad input with rebindable actions and jump buffering. */

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'jump' | 'spin' | 'stomp' | 'chomp' | 'interact'
  | 'camLeft' | 'camRight' | 'zoom' | 'recenter' | 'pause' | 'sniff';

const DEFAULT_BINDINGS: Record<Action, string[]> = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], spin: ['KeyJ'], stomp: ['KeyK'], chomp: ['KeyL'],
  interact: ['KeyE', 'Enter'], camLeft: ['KeyQ'], camRight: ['KeyR'],
  zoom: ['KeyZ'], recenter: ['KeyC'], pause: ['Escape', 'KeyP'], sniff: ['KeyT'],
};

const PAD: Partial<Record<Action, number[]>> = {
  jump: [0], spin: [2], stomp: [1], chomp: [3], interact: [0],
  pause: [9], recenter: [11], zoom: [3], sniff: [2],
};

export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private bindings: Record<Action, string[]>;
  private buffers = new Map<Action, number>();
  private padDown = new Set<number>();
  private padPressed = new Set<number>();
  /** Pointer deltas for camera orbit (drag). */
  pointerDX = 0; pointerDY = 0; wheelDelta = 0;
  private dragging = false;
  enabled = true;

  constructor(custom?: Record<string, string[]>) {
    this.bindings = { ...DEFAULT_BINDINGS, ...(custom ?? {}) } as Record<Action, string[]>;
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code); this.pressedThisFrame.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this.padDown.clear(); });
    window.addEventListener('mousedown', (e) => { if (e.button === 0 || e.button === 2) this.dragging = true; });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.dragging) { this.pointerDX += e.movementX; this.pointerDY += e.movementY; }
    });
    window.addEventListener('wheel', (e) => { this.wheelDelta += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  rebind(action: Action, codes: string[]): void { this.bindings[action] = codes; }
  getBindings(): Record<Action, string[]> { return { ...this.bindings }; }

  /** Poll gamepads; call once per frame before reading state. */
  update(dt: number): void {
    const prevPad = new Set(this.padDown);
    this.padDown.clear(); this.padPressed.clear();
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const pad = navigator.getGamepads()[0];
      if (pad) {
        pad.buttons.forEach((b, i) => {
          if (b.pressed) {
            this.padDown.add(i);
            if (!prevPad.has(i)) this.padPressed.add(i);
          }
        });
        this.padAxes = [pad.axes[0] ?? 0, pad.axes[1] ?? 0, pad.axes[2] ?? 0, pad.axes[3] ?? 0];
      } else this.padAxes = [0, 0, 0, 0];
    }
    for (const [k, t] of this.buffers) {
      const left = t - dt;
      if (left <= 0) this.buffers.delete(k); else this.buffers.set(k, left);
    }
  }

  private padAxes: [number, number, number, number] = [0, 0, 0, 0];

  held(action: Action): boolean {
    if (!this.enabled) return false;
    if (this.bindings[action]?.some((c) => this.down.has(c))) return true;
    return (PAD[action] ?? []).some((i) => this.padDown.has(i));
  }

  pressed(action: Action): boolean {
    if (!this.enabled) return false;
    if (this.bindings[action]?.some((c) => this.pressedThisFrame.has(c))) return true;
    return (PAD[action] ?? []).some((i) => this.padPressed.has(i));
  }

  /** Record a press into a buffer window (e.g. jump buffering). */
  buffer(action: Action, windowSeconds: number): void {
    if (this.pressed(action)) this.buffers.set(action, windowSeconds);
  }
  consumeBuffered(action: Action): boolean {
    if (this.buffers.has(action)) { this.buffers.delete(action); return true; }
    return false;
  }
  hasBuffered(action: Action): boolean { return this.buffers.has(action); }

  /** Movement vector [-1..1] from keys + left stick. */
  moveVector(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let y = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
    const [ax, ay] = this.padAxes;
    if (Math.abs(ax) > 0.18) x += ax;
    if (Math.abs(ay) > 0.18) y += ay;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  /** Camera vector from right stick. */
  cameraVector(): { x: number; y: number } {
    const [, , cx, cy] = this.padAxes;
    return { x: Math.abs(cx) > 0.18 ? cx : 0, y: Math.abs(cy) > 0.18 ? cy : 0 };
  }

  /** Consume per-frame edge state; call at end of frame. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.pointerDX = 0; this.pointerDY = 0; this.wheelDelta = 0;
  }
}
