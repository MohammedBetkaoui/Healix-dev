import { PrescriptionNumberService } from './prescription-number.service';

describe('PrescriptionNumberService', () => {
  it('uses the atomic sequence value returned by the transaction', async () => {
    const upsert = jest.fn().mockResolvedValue({ lastValue: 42 });
    const transaction = {
      clinicalDocumentSequence: { upsert },
    } as never;
    const number = await new PrescriptionNumberService().next(
      transaction,
      new Date('2026-10-21T12:00:00Z'),
    );
    expect(number).toBe('ORD-2026-000042');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { lastValue: { increment: 1 } },
      }),
    );
  });
});
