import {
  type HttpFaultProxy,
  type ProxiedRequest,
  type RequestMatch,
} from './fault-proxy';

// What a scenario says about the network. The tests depend on this class only,
// never on the proxy mechanics: replacing the proxy (Toxiproxy, a TC rule...)
// means re-implementing these few methods.

export const SYNC_PUSH: RequestMatch = {
  method: 'POST',
  path: '/api/sync/push',
};
export const SYNC_PULL: RequestMatch = {
  method: 'GET',
  path: '/api/sync/pull',
};
export const SYNC_ACK: RequestMatch = { method: 'POST', path: '/api/sync/ack' };
export const SYNC_RECONCILE: RequestMatch = {
  method: 'POST',
  path: '/api/sync/reconcile',
};
export const ANY_REQUEST: RequestMatch = {};

export class NetworkFaultController {
  constructor(private readonly proxy: HttpFaultProxy) {}

  // The machine has no network at all: nothing reaches the Backend.
  goOffline() {
    this.proxy.addRule(ANY_REQUEST, { kind: 'cut' });
  }

  restoreNetwork() {
    this.proxy.clearRules();
  }

  resetAll() {
    this.proxy.clearRules();
    this.proxy.log.length = 0;
  }

  // The request is lost before the Backend sees it.
  cutConnection(match: RequestMatch, times = 1) {
    this.proxy.addRule(match, { kind: 'cut' }, times);
  }

  // TCP RST: `before` = the request never arrived, `after` = the Backend
  // processed it and the connection died instead of the response.
  resetConnection(match: RequestMatch, when: 'before' | 'after', times = 1) {
    this.proxy.addRule(match, { kind: 'reset', when }, times);
  }

  // The Backend commits, the answer is lost: the lost-ACK case.
  dropResponse(match: RequestMatch, times = 1) {
    this.proxy.addRule(match, { kind: 'dropResponse' }, times);
  }

  // The client times out; whether the Backend processed the request is
  // unknowable to it (forward: true) or certainly not (forward: false).
  timeout(match: RequestMatch, options: { forward: boolean }, times = 1) {
    this.proxy.addRule(match, { kind: 'timeout', ...options }, times);
  }

  enableLatency(
    match: RequestMatch,
    latency: { requestMs?: number; responseMs?: number },
    times = Infinity,
  ) {
    this.proxy.addRule(match, { kind: 'latency', ...latency }, times);
  }

  // The same signed request, nonce included, reaches the Backend twice.
  duplicateRequest(match: RequestMatch, times = 1) {
    this.proxy.addRule(match, { kind: 'duplicate' }, times);
  }

  // Code around the forwarding of the next matching request.
  around(
    match: RequestMatch,
    hooks: {
      before?: () => Promise<void>;
      after?: () => Promise<void>;
      dropResponse?: boolean;
    },
    times = 1,
  ) {
    this.proxy.addRule(match, { kind: 'hook', ...hooks }, times);
  }

  // Every request that went through, with the fault applied to it.
  requests(filter?: RequestMatch): ProxiedRequest[] {
    return this.proxy.log.filter((entry) => {
      if (filter?.method && filter.method !== entry.method) return false;
      if (!filter?.path) return true;
      return typeof filter.path === 'string'
        ? entry.path.startsWith(filter.path)
        : filter.path.test(entry.path);
    });
  }

  count(filter?: RequestMatch) {
    return this.requests(filter).length;
  }

  // True once every armed fault has been consumed (a scenario asserts that the
  // fault it meant to inject really happened).
  allFaultsFired() {
    return this.proxy.pendingRules() === 0;
  }

  baseUrl() {
    return this.proxy.baseUrl();
  }
}
