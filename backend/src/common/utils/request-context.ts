import { type Request } from 'express';

export type RequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

const forwardedIpHeaders = [
  'cf-connecting-ip',
  'true-client-ip',
  'x-real-ip',
  'x-forwarded-for',
] as const;

function readHeaderValue(request: Request, headerName: string): string | null {
  const value = request.headers[headerName];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === 'string' ? value : null;
}

function stripPort(ipAddress: string): string {
  if (ipAddress.startsWith('[')) {
    return ipAddress.slice(1, ipAddress.indexOf(']'));
  }

  const portSeparatorIndex = ipAddress.lastIndexOf(':');
  const hasSingleColon = ipAddress.indexOf(':') === portSeparatorIndex;

  if (hasSingleColon && portSeparatorIndex > -1) {
    return ipAddress.slice(0, portSeparatorIndex);
  }

  return ipAddress;
}

function normalizeIpAddress(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const firstIpAddress = value
    .split(',')[0]
    .trim()
    .replace(/^"|"$/g, '');

  if (!firstIpAddress) {
    return null;
  }

  const withoutPort = stripPort(firstIpAddress);

  if (
    withoutPort === '::1' ||
    withoutPort === ':::1' ||
    withoutPort === '0:0:0:0:0:0:0:1'
  ) {
    return '127.0.0.1';
  }

  if (withoutPort.startsWith('::ffff:')) {
    return withoutPort.replace('::ffff:', '');
  }

  return withoutPort;
}

function getForwardedIpAddress(request: Request): string | null {
  for (const headerName of forwardedIpHeaders) {
    const ipAddress = normalizeIpAddress(readHeaderValue(request, headerName));

    if (ipAddress) {
      return ipAddress;
    }
  }

  return null;
}

export function getRequestContext(request: Request): RequestContext {
  return {
    ipAddress:
      getForwardedIpAddress(request) ??
      normalizeIpAddress(request.ip) ??
      normalizeIpAddress(request.socket.remoteAddress),
    userAgent: request.get('user-agent') ?? null,
  };
}
