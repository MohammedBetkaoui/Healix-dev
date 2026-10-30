// Waiting on a condition, never on the clock: poll, with a hard ceiling.

export async function pollUntil<T>(
  description: string,
  probe: () =>
    | Promise<T | undefined | null | false>
    | T
    | undefined
    | null
    | false,
  { timeoutMs = 30_000, intervalMs = 100 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  for (;;) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() > deadline) {
      const reason =
        lastError instanceof Error ? ` (last error: ${lastError.message})` : '';
      throw new Error(
        `Timed out after ${timeoutMs} ms waiting for ${description}${reason}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// Scenario trace: technical fields only (scenario, operation, entity, status,
// version, fault). Never a clinical text, a token, a grant or a key.
export function trace(scenario: string, fields: Record<string, unknown>) {
  if (process.env.OFFLINE_E2E_TRACE === '0') return;
  process.stdout.write(`[offline-e2e] ${scenario} ${JSON.stringify(fields)}\n`);
}
