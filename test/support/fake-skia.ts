// Skia draws the map's marker images natively. Under Jest every export is a stub that answers
// any property read, call or `new` with itself, so the images build from nothing.
const stub: unknown = new Proxy(function skia() {}, {
  get: (_target, key) => (key === 'then' ? undefined : key === Symbol.toPrimitive ? () => 0 : stub),
  apply: () => stub,
  construct: () => stub as object,
});

module.exports = new Proxy({}, { get: (_target, key) => (key === '__esModule' ? false : stub) });
