import { UserRole } from '../enums/user-role.enum';
import { formatPhysicianName, isPhysicianRole } from './physician-name';

describe('formatPhysicianName', () => {
  it('adds "Dr" to a name typed without a title', () => {
    expect(formatPhysicianName('Amel Benaïssa')).toBe('Dr Amel Benaïssa');
    expect(formatPhysicianName('  Amel Benaïssa ')).toBe('Dr Amel Benaïssa');
  });

  it.each([
    'Dr Amel Benaïssa',
    'dr Amel Benaïssa',
    'DR Amel Benaïssa',
    'Dr. Amel Benaïssa',
    'Dr.Amel Benaïssa',
    'Docteur Amel Benaïssa',
    'docteure Amel Benaïssa',
    'د. Amel Benaïssa',
    'Dr Dr Amel Benaïssa',
  ])('never doubles the title of %p', (fullName) => {
    expect(formatPhysicianName(fullName)).toBe('Dr Amel Benaïssa');
  });

  it('keeps names that only start like the title', () => {
    expect(formatPhysicianName('Driss Kaci')).toBe('Dr Driss Kaci');
    expect(formatPhysicianName('Dréan Kaci')).toBe('Dr Dréan Kaci');
    expect(formatPhysicianName('Doctorov Kaci')).toBe('Dr Doctorov Kaci');
  });

  it('keeps a name that is nothing but the title', () => {
    expect(formatPhysicianName('Dr.')).toBe('Dr Dr.');
  });
});

describe('isPhysicianRole', () => {
  it('is true for the two doctor roles only', () => {
    expect(isPhysicianRole(UserRole.INDEPENDENT_DOCTOR)).toBe(true);
    expect(isPhysicianRole(UserRole.AFFILIATED_DOCTOR)).toBe(true);
    expect(isPhysicianRole(UserRole.ESTABLISHMENT_ADMIN)).toBe(false);
    expect(isPhysicianRole(UserRole.SUPER_ADMIN)).toBe(false);
  });
});
