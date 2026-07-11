// Sliding-window per-socket event limiter. Returns false once a socket
// exceeds `limit` calls to a given event within `windowMs`.
export class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map(); // socketId -> timestamps[]
  }

  allow(socketId) {
    const now = Date.now();
    const timestamps = this.hits.get(socketId) || [];
    const recent = timestamps.filter((t) => now - t < this.windowMs);
    recent.push(now);
    this.hits.set(socketId, recent);
    return recent.length <= this.limit;
  }

  clear(socketId) {
    this.hits.delete(socketId);
  }
}
