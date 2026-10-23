// What a session shows of the device behind it: a browser and a system a
// person recognizes, and an address that does not identify a network.

export type SessionDevice = {
  browser: string | null;
  os: string | null;
};

// In this order: most browsers name the ones they are built on (Edge and
// Opera say Chrome, Chrome says Safari).
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdgA?\/|\bEdg\/|\bEdgiOS\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bChrome\/|\bCriOS\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

// iPadOS and iOS also say "like Mac OS X": they come first.
const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\biPhone\b|\biPad\b|\biPod\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b|\bX11\b/, 'Linux'],
];

function firstMatch(
  value: string,
  candidates: readonly (readonly [RegExp, string])[],
): string | null {
  return candidates.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

export function parseUserAgent(userAgent: string | null): SessionDevice {
  if (!userAgent) {
    return { browser: null, os: null };
  }

  return {
    browser: firstMatch(userAgent, BROWSERS),
    os: firstMatch(userAgent, SYSTEMS),
  };
}

// 41.200.12.34 -> 41.200.x.x ; 2a01:e0a:1b2:c3d0::1 -> 2a01:e0a:x:x:x:x:x:x
export function maskIpAddress(ipAddress: string | null): string | null {
  const value = ipAddress?.trim();

  if (!value) {
    return null;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    const [first, second] = value.split('.');
    return `${first}.${second}.x.x`;
  }

  if (value.includes(':')) {
    const groups = value.split(':').filter(Boolean);
    return groups.length >= 2 ? `${groups[0]}:${groups[1]}:x:x:x:x:x:x` : null;
  }

  return null;
}
