import * as THREE from 'three';

// THREE.MathUtils.damp is an exponential approach to a target that's
// frame-rate independent (unlike a plain `x += (target-x) * k`, which
// subtly changes speed if the frame rate changes) — used everywhere an
// object eases toward a value (door swing, walk position, idle bob) for
// motion that reads as deliberately animated rather than just "snapping
// via lerp".
export function damp(current, target, lambda, delta) {
  return THREE.MathUtils.damp(current, target, lambda, delta);
}

export function damp3(vec3, target, lambda, delta) {
  vec3.x = damp(vec3.x, target[0], lambda, delta);
  vec3.y = damp(vec3.y, target[1], lambda, delta);
  vec3.z = damp(vec3.z, target[2], lambda, delta);
}

// Simple ease-out-back overshoot, for a small satisfying "settle" bounce
// (0 -> 1 input/output) instead of every motion easing to a dead stop.
export function easeOutBack(x) {
  const c1 = 1.7;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
