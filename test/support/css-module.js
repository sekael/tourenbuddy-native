// CSS Modules under Jest (web project): each class name maps to itself, so tests query the PWA's
// class names; plain stylesheet imports resolve to the same inert object.
module.exports = new Proxy({}, { get: (_, key) => (key === '__esModule' ? false : key) });
