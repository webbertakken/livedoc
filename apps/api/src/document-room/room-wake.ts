// How long a room took from its start to the first thing it was asked (docs/specs/016-platform/web-performance.md
// "The api"): what a request pays for finding the room asleep, read once by the first request after a wake.

export class RoomWake {
  private readonly now: () => number;
  private startedAt: number | null;

  constructor(now: () => number = Date.now) {
    this.now = now;
    this.startedAt = now();
  }

  // The time since the room started, the first time only; null after that.
  take(): number | null {
    if (this.startedAt === null) return null;
    const since = this.now() - this.startedAt;
    this.startedAt = null;
    return since;
  }
}
