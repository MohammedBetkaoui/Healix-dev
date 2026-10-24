// Offline settlements (cash, postal transfer, BaridiMob receipt) are off by
// default: the way to subscribe is the online card payment, which activates
// the subscription at once. MANUAL_PAYMENTS_ENABLED=true brings them back
// (new intents only: payments already waiting for review stay viewable and
// can still be validated by an administrator).
export function isManualPaymentsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.MANUAL_PAYMENTS_ENABLED?.trim().toLowerCase() === 'true';
}
