// jsdom has no `matchMedia`; react-native-web reads `prefers-reduced-motion` through it.
Object.defineProperty(window, 'matchMedia', {
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
});
