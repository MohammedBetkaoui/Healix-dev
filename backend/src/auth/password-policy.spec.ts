import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { LoginDto } from './dto/login.dto';
import { RegisterEstablishmentDto } from './dto/register-establishment.dto';
import { RegisterIndependentDoctorDto } from './dto/register-independent-doctor.dto';
import { ResetPasswordDto } from './password-reset/password-reset.dto';

// A password chosen at registration or reset must be read the same way at
// login: same trimming, same minimum length.
const PASSWORDS = [
  'Nouveau-mot-2026',
  '  Nouveau-mot-2026  ',
  '12345678',
  ' 12345678\t',
  '1234567',
  '   1234567   ',
  '        ',
  '',
];

type Form = {
  name: string;
  read: (password: string) => Promise<{ valid: boolean; value: unknown }>;
};

async function readPassword<T extends { password: unknown }>(
  dtoClass: new () => T,
  body: Record<string, unknown>,
) {
  const dto = plainToInstance(dtoClass, body);
  const errors = await validate(dto);
  return {
    valid: !errors.some((error) => error.property === 'password'),
    value: dto.password,
  };
}

const forms: Form[] = [
  {
    name: 'login',
    read: (password) =>
      readPassword(LoginDto, {
        accountType: 'ESTABLISHMENT',
        email: 'amina@clinique.dz',
        password,
      }),
  },
  {
    name: 'establishment registration',
    read: (password) =>
      readPassword(RegisterEstablishmentDto, {
        acceptTerms: true,
        acceptVerification: true,
        address: '12 rue des Oliviers, Alger',
        confirmPassword: password,
        establishmentName: 'Clinique des Oliviers',
        establishmentType: 'CLINIC',
        managerFullName: 'Amina Benali',
        password,
        phone: '0555 12 34 56',
        professionalEmail: 'amina@clinique.dz',
        wilaya: 'Alger',
      }),
  },
  {
    name: 'doctor registration',
    read: (password) =>
      readPassword(RegisterIndependentDoctorDto, {
        acceptTerms: true,
        acceptVerification: true,
        confirmPassword: password,
        email: 'amina@clinique.dz',
        fullName: 'Amina Benali',
        password,
        phone: '0555 12 34 56',
        professionalAddress: '12 rue des Oliviers, Alger',
        speciality: 'Neurologie',
        wilaya: 'Alger',
      }),
  },
  {
    name: 'password reset',
    read: (password) =>
      readPassword(ResetPasswordDto, {
        confirmPassword: password,
        password,
        token: 'x',
      }),
  },
];

describe('password rule shared by login, registration and reset', () => {
  it.each(PASSWORDS)('reads %j the same way everywhere', async (password) => {
    const results = await Promise.all(forms.map((form) => form.read(password)));
    const [login, ...others] = results;

    for (const [index, result] of others.entries()) {
      expect({ form: forms[index + 1].name, ...result }).toEqual({
        form: forms[index + 1].name,
        ...login,
      });
    }
  });

  it('trims the login password before checking it', async () => {
    await expect(forms[0].read('  Nouveau-mot-2026  ')).resolves.toEqual({
      valid: true,
      value: 'Nouveau-mot-2026',
    });
    // 7 characters once trimmed: refused, as at registration.
    await expect(forms[0].read('   1234567   ')).resolves.toEqual({
      valid: false,
      value: '1234567',
    });
  });
});
