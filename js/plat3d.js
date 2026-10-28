// A third-person 3D platformer body, shared by Tower of Doom and Natural Disasters: walk relative to the camera,
// jump, fall, and bump into boxes [x0, y0, z0, x1, y1, z1]. The camera orbits with the mouse (click to lock) or a finger.
import { THREE, clamp, wrap, keys, moveInput, takeLook, pointerLocked } from './g3d.js';

export const PR = 0.4, PH = 1.75;
// p: { x, y, z, vy, yaw, ground }; returns how fast it moved
export function stepPlayer(p, inp, camYaw, boxes, dt, o = {}) {
  const sp = (o.speed || 7) * (inp.run ? 1.3 : 1);
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  let dx = fx * inp.fwd - fz * inp.side, dz = fz * inp.fwd + fx * inp.side;
  const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
  if (l > 0.1) p.yaw += wrap(Math.atan2(-dx, -dz) - p.yaw) * Math.min(1, dt * 12);
  move(p, 'x', dx * sp * dt, boxes); move(p, 'z', dz * sp * dt, boxes);
  if (inp.jump && p.ground) { p.vy = o.jump || 9.5; p.ground = false; }
  p.vy = Math.max(p.vy - (o.gravity || 26) * dt, -45);
  p.ground = false; p.on = null;
  move(p, 'y', p.vy * dt, boxes);
  if (o.floor !== undefined && p.y < o.floor) { p.y = o.floor; p.vy = 0; p.ground = true; }
  return l * sp;
}
function move(p, axis, d, boxes) {
  if (!d) return;
  p[axis] += d;
  for (const b of boxes) {
    const [x0, y0, z0, x1, y1, z1] = b;
    if (p.x + PR <= x0 || p.x - PR >= x1 || p.z + PR <= z0 || p.z - PR >= z1 || p.y + PH <= y0 || p.y >= y1) continue;
    if (axis === 'y') { if (d < 0) { p.y = y1; p.vy = 0; p.ground = true; p.on = b; } else { p.y = y0 - PH; p.vy = 0; } }
    else if (axis === 'x') p.x = d > 0 ? x0 - PR - 0.001 : x1 + PR + 0.001;
    else p.z = d > 0 ? z0 - PR - 0.001 : z1 + PR + 0.001;
  }
}
export function touching(p, b, pad = 0.05) { const [x0, y0, z0, x1, y1, z1] = b; return p.x + PR + pad > x0 && p.x - PR - pad < x1 && p.z + PR + pad > z0 && p.z - PR - pad < z1 && p.y + PH > y0 && p.y - pad < y1; }
// the camera: orbits with the mouse; without a lock it slowly swings behind you
export class OrbitCam {
  constructor() { this.yaw = 0; this.pitch = 0.35; this.dist = 9; }
  update(cam, p, dt, moving) {
    const [lx, ly] = takeLook();
    this.yaw = wrap(this.yaw - lx * 0.004); this.pitch = clamp(this.pitch + ly * 0.003, -0.3, 1.3);
    if (!pointerLocked() && !lx && moving) this.yaw += wrap(p.yaw - this.yaw) * Math.min(1, dt * 1.2);
    cam.position.set(p.x + Math.sin(this.yaw) * this.dist * Math.cos(this.pitch), p.y + 2.2 + Math.sin(this.pitch) * this.dist, p.z + Math.cos(this.yaw) * this.dist * Math.cos(this.pitch));
    cam.lookAt(p.x, p.y + 1.6, p.z);
  }
}
export { THREE, keys, moveInput };
