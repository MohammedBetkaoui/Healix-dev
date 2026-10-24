import { PrescriptionNumberService } from './prescription-number.service';

// The counter itself (INSERT ... ON DUPLICATE KEY UPDATE) is exercised on a
// real database: reports/report-numbering.integration.spec.ts.
describe('PrescriptionNumberService', () => {
  const fakeTransaction = (lastValue: number) => {
    const $executeRaw = jest
      .fn<Promise<number>, unknown[]>()
      .mockResolvedValue(1);
    const $queryRaw = jest
      .fn<Promise<unknown>, unknown[]>()
      .mockResolvedValue([{ last_value: lastValue }]);
    return {
      $executeRaw,
      $queryRaw,
      transaction: { $executeRaw, $queryRaw } as never,
    };
  };

  it('uses the atomic sequence value read in the transaction', async () => {
    const { $executeRaw, $queryRaw, transaction } = fakeTransaction(42);

    const number = await new PrescriptionNumberService().next(
      transaction,
      new Date('2026-10-21T12:00:00Z'),
    );

    expect(number).toBe('ORD-2026-000042');
    // The counter of (PRESCRIPTION, 2026) is incremented, then read back.
    const [strings, ...values] = $executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(strings.join('?')).toContain('ON DUPLICATE KEY UPDATE');
    expect(values).toEqual(['PRESCRIPTION', 2026]);
    expect($queryRaw.mock.calls[0].slice(1)).toEqual(['PRESCRIPTION', 2026]);
  });

  it('counts the year on the calendar of Algiers', async () => {
    const { transaction } = fakeTransaction(1);
    const service = new PrescriptionNumberService();

    // 23:30 UTC on 31 December is already 1 January in Algiers.
    expect(
      await service.next(transaction, new Date('2026-12-31T23:30:00Z')),
    ).toBe('ORD-2027-000001');
  });
});
