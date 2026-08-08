/**
 * Pure jump-decision logic: coyote time, jump buffering, double jump,
 * variable height. No three.js — unit-tested headless (tests/unit).
 */
export interface JumpConfig {
  coyoteTime: number;
  jumpBuffer: number;
  jumpVelocity: number;
  doubleJumpVelocity: number;
  variableJumpCut: number; // multiply vy by this when jump released early
}

export type JumpEvent = 'jump' | 'double' | null;

export class JumpLogic {
  private coyote = 0;
  private buffer = 0;
  private jumpsUsed = 0;
  private rising = false;

  constructor(private cfg: JumpConfig) {}

  /** Call once per frame. Returns the jump event to apply (if any). */
  update(dt: number, grounded: boolean, jumpPressed: boolean): JumpEvent {
    if (grounded) {
      this.coyote = this.cfg.coyoteTime;
      this.jumpsUsed = 0;
      this.rising = false;
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
    }
    if (jumpPressed) this.buffer = this.cfg.jumpBuffer;
    else this.buffer = Math.max(0, this.buffer - dt);

    if (this.buffer > 0) {
      if (grounded || this.coyote > 0) {
        this.consume();
        this.jumpsUsed = 1;
        this.rising = true;
        return 'jump';
      }
      if (this.jumpsUsed < 2) {
        // Airborne without coyote: spend the one air jump (this also covers
        // walking off a ledge — the double is still available mid-fall).
        this.consume();
        this.jumpsUsed = 2;
        this.rising = true;
        return 'double';
      }
      // A buffered press while out of jumps stays buffered until it expires —
      // landing within the window still triggers the jump (the feel-good part).
    }
    return null;
  }

  /**
   * Variable jump height: call when the jump button is released.
   * Returns the velocity multiplier to apply (1 = unchanged).
   */
  onJumpReleased(vy: number): number {
    if (this.rising && vy > 0) {
      this.rising = false;
      return this.cfg.variableJumpCut;
    }
    return 1;
  }

  /** Mark that the upward phase ended naturally (apex). */
  notifyFalling(): void { this.rising = false; }

  /** Used after external launches (spring pads) so a double jump is available. */
  setAirborneWithJumps(used: number): void { this.jumpsUsed = used; this.coyote = 0; }

  private consume(): void { this.buffer = 0; this.coyote = 0; }

  get airJumpsUsed(): number { return this.jumpsUsed; }
}

/** v = √(2·g·h) — initial velocity for a desired apex height. */
export function jumpVelocityFor(gravity: number, height: number): number {
  return Math.sqrt(2 * gravity * height);
}
