import { Logger } from '@nestjs/common';

import { SubscriptionExpiryScheduler } from './subscription-expiry.scheduler';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionExpiryScheduler', () => {
  const expireDueSubscriptions = jest.fn();
  const scheduler = new SubscriptionExpiryScheduler({
    expireDueSubscriptions,
  } as unknown as SubscriptionsService);
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs how many subscriptions a run expired', async () => {
    expireDueSubscriptions.mockResolvedValue(3);

    await scheduler.expireDueSubscriptions();

    expect(logSpy).toHaveBeenCalledWith('3 subscription(s) expired.');
  });

  it('logs a failed run instead of rejecting', async () => {
    expireDueSubscriptions.mockRejectedValue(new Error('database unavailable'));

    await expect(scheduler.expireDueSubscriptions()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      'Subscription expiry run failed.',
      expect.stringContaining('database unavailable'),
    );
  });
});
