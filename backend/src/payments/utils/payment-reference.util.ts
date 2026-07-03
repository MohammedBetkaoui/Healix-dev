export function createPaymentReference(sequence: number, date = new Date()) {
  const year = date.getFullYear();
  const paddedSequence = String(sequence).padStart(6, '0');

  return `HLX-PAY-${year}-${paddedSequence}`;
}
