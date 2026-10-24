import {
  compareIdentity,
  nameTokens,
  type RecordPatient,
} from './dicom-identity';

const patient: RecordPatient = {
  birthDate: new Date('1990-01-05T00:00:00.000Z'),
  firstName: 'Amine',
  firstNameAr: 'أمين',
  gender: 'MALE',
  lastName: 'Benali',
  lastNameAr: 'بن علي',
};

const dicom = (
  overrides: Partial<Parameters<typeof compareIdentity>[1]> = {},
) => ({
  patientBirthDate: '19900105',
  patientName: 'BENALI^AMINE',
  patientSex: 'M',
  ...overrides,
});

describe('the identity check of a DICOM header', () => {
  it('has nothing to say about a header that matches', () => {
    expect(compareIdentity(patient, dicom())).toEqual([]);
  });

  it.each([
    'BENALI^Amine',
    'Amine Benali',
    'benali amine',
    'Benali^Amine^Mohamed^^',
    'BÉNALI^AMINE',
    'Benali-Amine',
  ])('accepts the name "%s"', (name) => {
    expect(compareIdentity(patient, dicom({ patientName: name }))).toEqual([]);
  });

  it('accepts the Arabic spelling of the record', () => {
    expect(
      compareIdentity(patient, dicom({ patientName: 'بن علي^أمين' })),
    ).toEqual([]);
  });

  it('warns about another name, quoting what the header says', () => {
    expect(
      compareIdentity(patient, dicom({ patientName: 'PATIENT^FICTIF' })),
    ).toEqual([{ dicomValue: 'PATIENT^FICTIF', field: 'PatientName' }]);
  });

  it('warns when only one of the two names is found', () => {
    expect(
      compareIdentity(patient, dicom({ patientName: 'BENALI^SAMIR' })),
    ).toEqual([{ dicomValue: 'BENALI^SAMIR', field: 'PatientName' }]);
  });

  it('warns about another birth date and another sex', () => {
    expect(
      compareIdentity(
        patient,
        dicom({ patientBirthDate: '19900106', patientSex: 'F' }),
      ),
    ).toEqual([
      { dicomValue: '19900106', field: 'PatientBirthDate' },
      { dicomValue: 'F', field: 'PatientSex' },
    ]);
  });

  it('warns about every difference at once', () => {
    const warnings = compareIdentity(
      patient,
      dicom({
        patientBirthDate: '20000101',
        patientName: 'X^Y',
        patientSex: 'O',
      }),
    );

    expect(warnings.map((warning) => warning.field)).toEqual([
      'PatientName',
      'PatientBirthDate',
      'PatientSex',
    ]);
  });

  it('does not compare what the header does not carry', () => {
    expect(
      compareIdentity(patient, {
        patientBirthDate: null,
        patientName: null,
        patientSex: '',
      }),
    ).toEqual([]);
  });

  it('reads the sex in lower case', () => {
    expect(compareIdentity(patient, dicom({ patientSex: 'm' }))).toEqual([]);
  });

  it('splits a name into words without accents or case', () => {
    expect(nameTokens('BÉNALI^Amine-Ali')).toEqual(['benali', 'amine', 'ali']);
  });
});
