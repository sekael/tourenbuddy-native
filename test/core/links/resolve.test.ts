import { notificationIdIn, resolveLink } from '@/core/links/resolve';

describe('resolveLink', () => {
  it.each([
    ['https://tourenbuddy.ch/?notification=abc-123', '/?notification=abc-123'],
    ['https://test.tourenbuddy.ch/?notification=abc-123', '/?notification=abc-123'],
    ['https://tourenbuddy.ch/calendar?notification=n1&x=2', '/?notification=n1'],
    ['tourenbuddy://?notification=n1', '/?notification=n1'],
    ['https://tourenbuddy.ch/contacts', '/contacts'],
    ['https://TourenBuddy.ch/contacts/', '/contacts'],
    ['https://tourenbuddy.ch/calendar?day=2026-11-09', '/calendar?day=2026-11-09'],
    ['tourenbuddy://contacts', '/contacts'],
    ['tourenbuddy-dev://tour/0b0e4c1a', '/tour/0b0e4c1a'],
    ['/profile?open=notifications', '/profile?open=notifications'],
  ])('should open %s at %s', (url, path) => {
    expect(resolveLink(url)).toBe(path);
  });

  it.each([
    ['another host', 'https://evil.example/contacts'],
    ['a look-alike host', 'https://tourenbuddy.ch.evil.example/contacts'],
    ['an unknown path', 'https://tourenbuddy.ch/wp-admin'],
    ['a legal page', 'https://tourenbuddy.ch/privacy'],
    ['an unknown scheme', 'javascript://alert(1)'],
    ['junk', 'not a url'],
    ['nothing', ''],
  ])('should open the map for %s', (_, url) => {
    expect(resolveLink(url)).toBe('/');
  });

  it('should drop a notification id that is not an id', () => {
    expect(resolveLink('https://tourenbuddy.ch/?notification=%3Cscript%3E')).toBe('/');
    expect(notificationIdIn('https://tourenbuddy.ch/?notification=')).toBeNull();
    expect(notificationIdIn(42)).toBeNull();
  });
});
