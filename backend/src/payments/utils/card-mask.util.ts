export function normalizeCardNumber(cardNumber: string): string {
  return cardNumber.replace(/\s+/g, '').trim();
}

export function getCardLast4(cardNumber: string): string {
  return normalizeCardNumber(cardNumber).slice(-4);
}

export function normalizeCardHolderName(cardHolderName: string): string {
  return cardHolderName.trim().replace(/\s+/g, ' ').toUpperCase();
}
