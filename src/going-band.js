// Along the current nosing, find the widest interval where a ray normal to
// that nosing can travel the required distance inside the *going* polygon.
// Its far edge is the next nosing. The overlap of the upper tread is excluded.
export function goingBandWidth(front, normal, contour, minimum) {
  const [start, end] = front;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (!(length > 0)) return 0;
  const ux = (end.x - start.x) / length, uy = (end.y - start.y) / length;
  const points = contour.map(p => {
    const x = p.x - start.x, y = p.y - start.y;
    return { x: x * ux + y * uy, y: x * normal.x + y * normal.y };
  });
  const blocked = [];
  const epsilon = 1e-7;
  for (let i = 0; i < points.length; i++) {
    let a = points[i], b = points[(i + 1) % points.length];
    if (a.y > b.y) [a, b] = [b, a];
    if (b.y <= epsilon || a.y >= minimum - epsilon) continue;
    const at = y => a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
    const x1 = a.y < 0 ? at(0) : a.x;
    const x2 = b.y > minimum ? at(minimum) : b.x;
    const left = Math.max(0, Math.min(x1, x2)), right = Math.min(length, Math.max(x1, x2));
    if (right > left + epsilon) blocked.push([left, right]);
  }
  let cursor = 0, widest = 0;
  for (const [left, right] of blocked.sort((a, b) => a[0] - b[0])) {
    widest = Math.max(widest, left - cursor);
    cursor = Math.max(cursor, right);
  }
  return Math.max(widest, length - cursor);
}
