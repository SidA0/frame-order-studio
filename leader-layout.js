/* Noncrossing, free-position balloon layout for the fixed isometric sheet. */
(function (scope) {
  const EPS = 1e-7;
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const between = (a, b, c) => Math.min(a, b) - EPS <= c && c <= Math.max(a, b) + EPS;
  function intersects(a, b, c, d) {
    const abC = cross(a, b, c), abD = cross(a, b, d);
    const cdA = cross(c, d, a), cdB = cross(c, d, b);
    if (Math.abs(abC) < EPS && between(a[0], b[0], c[0]) && between(a[1], b[1], c[1])) return true;
    if (Math.abs(abD) < EPS && between(a[0], b[0], d[0]) && between(a[1], b[1], d[1])) return true;
    if (Math.abs(cdA) < EPS && between(c[0], d[0], a[0]) && between(c[1], d[1], a[1])) return true;
    if (Math.abs(cdB) < EPS && between(c[0], d[0], b[0]) && between(c[1], d[1], b[1])) return true;
    return abC * abD < 0 && cdA * cdB < 0;
  }
  function pointSegmentDistance(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function convexHull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const lower = [], upper = [];
    for (const p of sorted) { while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
    for (let i = sorted.length - 1; i >= 0; i--) { const p = sorted[i]; while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }
  function insideConvex(p, hull) {
    if (hull.length < 3) return false;
    let positive = false, negative = false;
    for (let i = 0; i < hull.length; i++) { const value = cross(hull[i], hull[(i + 1) % hull.length], p); positive ||= value > 0; negative ||= value < 0; if (positive && negative) return false; }
    return true;
  }
  function valid(anchor, balloon, placed, rect, radius) {
    if (balloon[0] < rect.x + radius || balloon[0] > rect.x + rect.w - radius ||
        balloon[1] < rect.y + radius || balloon[1] > rect.y + rect.h - radius) return false;
    for (const other of placed) {
      if (dist(balloon, other.balloon) < 2 * radius + 5) return false;
      if (pointSegmentDistance(balloon, other.anchor, other.balloon) < radius + 3) return false;
      if (pointSegmentDistance(other.balloon, anchor, balloon) < radius + 3) return false;
      if (intersects(anchor, balloon, other.anchor, other.balloon)) return false;
    }
    return true;
  }
  function layout(items, rect, options = {}) {
    const radius = options.radius ?? 11;
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const directions = Array.from({ length: 24 }, (_, i) => i * Math.PI / 12);
    const lengths = [30, 38, 48, 60, 76, 94, 116, 142, 172, 210, 255, 310, 370];
    let best = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      const ordered = [...items].sort((a, b) => {
        const da = Math.hypot(a.center[0] - cx, a.center[1] - cy);
        const db = Math.hypot(b.center[0] - cx, b.center[1] - cy);
        return (attempt % 2 ? da - db : db - da) || ((a.number * (attempt + 3)) % 73) - ((b.number * (attempt + 3)) % 73);
      });
      if (attempt >= 2) ordered.sort((a, b) => ((a.number * (attempt * 17 + 1)) % 97) - ((b.number * (attempt * 17 + 1)) % 97));
      const placed = [];
      for (const item of ordered) {
        let choice = null, bestScore = Infinity;
        const anchors = item.anchors || [item.center];
        for (const anchor of anchors) {
          if (anchor[0] < rect.x + 2 || anchor[0] > rect.x + rect.w - 2 || anchor[1] < rect.y + 2 || anchor[1] > rect.y + rect.h - 2) continue;
          const outward = Math.atan2(anchor[1] - cy, anchor[0] - cx);
          for (const length of lengths) {
            for (const angle of directions) {
              const balloon = [anchor[0] + length * Math.cos(angle), anchor[1] + length * Math.sin(angle)];
              if (!valid(anchor, balloon, placed, rect, radius)) continue;
              const deviation = Math.abs(Math.atan2(Math.sin(angle - outward), Math.cos(angle - outward)));
              const score = length + deviation * 11 + dist(anchor, item.center) * .07 + (insideConvex(balloon, options.avoidPolygon || []) ? 110 : 0);
              if (score < bestScore) { bestScore = score; choice = { ...item, anchor, balloon }; }
            }
            if (choice && bestScore < length + 15) break;
          }
        }
        if (!choice) break;
        placed.push(choice);
      }
      if (placed.length > best.length) best = placed;
      if (placed.length === items.length) return { callouts: placed, complete: true };
    }
    return { callouts: best, complete: false };
  }
  scope.LeaderLayout = { layout, convexHull, intersects, pointSegmentDistance };
})(typeof window === 'undefined' ? globalThis : window);
