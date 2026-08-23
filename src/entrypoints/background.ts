// Stub. M1 proves the build wiring only — no lifecycle, messaging, or state.
// Keep logic out of entrypoints: the TDD gate exempts them, so anything real
// parked here escapes testing.
export default defineBackground(() => {});
