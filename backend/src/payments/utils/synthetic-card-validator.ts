import {
  normalizeCardHolderName,
  normalizeCardNumber,
} from './card-mask.util';

const demoCard = {
  cardHolderName: 'BARKAOUI MOURAD',
  cardNumber: '1234123412341234',
  expiryMonth: '09',
  expiryYear: '2030',
  psv: '353',
} as const;

export function isValidSyntheticChargilyCard(input: {
  cardHolderName: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  psv: string;
}): boolean {
  return (
    normalizeCardNumber(input.cardNumber) === demoCard.cardNumber &&
    input.expiryMonth === demoCard.expiryMonth &&
    input.expiryYear === demoCard.expiryYear &&
    input.psv === demoCard.psv &&
    normalizeCardHolderName(input.cardHolderName) === demoCard.cardHolderName
  );
}
