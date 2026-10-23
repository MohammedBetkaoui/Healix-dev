import { maskIpAddress, parseUserAgent } from './session-device';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const EDGE_WINDOWS = `${CHROME_WINDOWS} Edg/129.0.0.0`;
const FIREFOX_LINUX =
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const SAMSUNG_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';

describe('parseUserAgent', () => {
  it.each([
    [CHROME_WINDOWS, 'Chrome', 'Windows'],
    [EDGE_WINDOWS, 'Edge', 'Windows'],
    [FIREFOX_LINUX, 'Firefox', 'Linux'],
    [SAFARI_MAC, 'Safari', 'macOS'],
    [SAFARI_IPHONE, 'Safari', 'iOS'],
    [CHROME_ANDROID, 'Chrome', 'Android'],
    [SAMSUNG_ANDROID, 'Samsung Internet', 'Android'],
  ])('reads %s', (userAgent, browser, os) => {
    expect(parseUserAgent(userAgent)).toEqual({ browser, os });
  });

  it('answers nothing for what it does not know', () => {
    expect(parseUserAgent(null)).toEqual({ browser: null, os: null });
    expect(parseUserAgent('curl/8.5.0')).toEqual({ browser: null, os: null });
  });
});

describe('maskIpAddress', () => {
  it('keeps the first two bytes of an IPv4 address', () => {
    expect(maskIpAddress('41.200.12.34')).toBe('41.200.x.x');
    expect(maskIpAddress('127.0.0.1')).toBe('127.0.x.x');
  });

  it('keeps the first two groups of an IPv6 address', () => {
    expect(maskIpAddress('2a01:e0a:1b2:c3d0::1')).toBe('2a01:e0a:x:x:x:x:x:x');
  });

  it('shows nothing for a missing or unreadable address', () => {
    expect(maskIpAddress(null)).toBeNull();
    expect(maskIpAddress('')).toBeNull();
    expect(maskIpAddress('unknown')).toBeNull();
    expect(maskIpAddress('::1')).toBeNull();
  });
});
