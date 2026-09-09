export function createTransitionController() {
  let active = null;
  return { cancel() { if (active) cancelAnimationFrame(active); active = null; }, run(duration, step, done) { this.cancel(); const started = performance.now(); const tick = (now) => { const progress = Math.min(1, (now - started) / Math.max(1, duration)); step(progress); if (progress < 1) active = requestAnimationFrame(tick); else { active = null; done?.(); } }; active = requestAnimationFrame(tick); }, get active() { return active !== null; } };
}
