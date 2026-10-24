import { isDicomUid, parseDicomWebRequest } from './dicomweb-path';

const UID = '1.2.826.0.1.3680043.8.498.1';

describe('the DICOMweb requests the proxy relays', () => {
  describe('inside a study', () => {
    it.each([
      [`/studies/${UID}`],
      [`/studies/${UID}/metadata`],
      [`/studies/${UID}/series`],
      [`/studies/${UID}/series/4.5/metadata`],
      [`/studies/${UID}/series/4.5/instances`],
      [`/studies/${UID}/series/4.5/instances/6.7/frames/1`],
      [`/studies/${UID}/series/4.5/instances/6.7/frames/1,2,3`],
      [`/studies/${UID}/series/4.5/instances/6.7/rendered`],
      [`/studies/${UID}/series/4.5/instances/6.7/thumbnail`],
      [`/studies/${UID}/series/4.5/instances/6.7/bulkdata/7fe00010`],
    ])('relays %s as it is', (path) => {
      expect(parseDicomWebRequest(path, '')).toEqual({
        path,
        studyInstanceUid: UID,
      });
    });

    it('keeps the parameters that page or narrow the answer, and drops the others', () => {
      expect(
        parseDicomWebRequest(
          `/studies/${UID}/series`,
          'includefield=0008103E&limit=5&Modality=MR&foo=bar&accept=text%2Fhtml',
        ),
      ).toEqual({
        path: `/studies/${UID}/series?includefield=0008103E&limit=5&Modality=MR`,
        studyInstanceUid: UID,
      });
    });

    it('refuses a second designation of the study', () => {
      expect(
        parseDicomWebRequest(
          `/studies/${UID}/series`,
          'StudyInstanceUID=9.9.9',
        ),
      ).toBeNull();
    });
  });

  describe('the search for one study', () => {
    it('relays /studies?StudyInstanceUID={uid}, with its paging parameters', () => {
      expect(
        parseDicomWebRequest(
          '/studies',
          `StudyInstanceUID=${UID}&limit=101&offset=0&fuzzymatching=false&includefield=00081030`,
        ),
      ).toEqual({
        path: `/studies?StudyInstanceUID=${UID}&limit=101&offset=0&fuzzymatching=false&includefield=00081030`,
        studyInstanceUid: UID,
      });
    });

    it.each([
      ['no UID', ''],
      ['an empty UID', 'StudyInstanceUID='],
      ['a UID that is not one', 'StudyInstanceUID=abc'],
      ['a list of UIDs', `StudyInstanceUID=${UID},1.2.3`],
      ['a wildcard', 'StudyInstanceUID=1.2.*'],
      ['the UID twice', `StudyInstanceUID=${UID}&StudyInstanceUID=1.2.3`],
      ['a search by patient name', 'PatientName=*'],
      [
        'a search by patient name beside the UID',
        `StudyInstanceUID=${UID}&PatientName=*`,
      ],
      ['a search by date', `StudyInstanceUID=${UID}&StudyDate=20260101-`],
      ['a modality filter at the root', `StudyInstanceUID=${UID}&Modality=MR`],
      ['a UID of 65 characters', `StudyInstanceUID=${'1'.repeat(65)}`],
    ])('refuses %s', (_label, query) => {
      expect(parseDicomWebRequest('/studies', query)).toBeNull();
    });
  });

  describe('everything else', () => {
    it.each([
      ['/series'],
      ['/instances'],
      ['/patients'],
      ['/'],
      [''],
      ['studies/1.2.3'],
      ['/studies/'],
      [`/studies/${UID}/`],
      ['/studies/abc'],
      ['/studies/1.2.3.'],
      ['/studies//1.2.3'],
      [`/studies/${UID}//metadata`],
      [`/studies/${UID}/series/../../../tools/reset`],
      [`/studies/${UID}/./metadata`],
      [`/studies/${UID}/%2e%2e/system`],
      [`/studies/${UID}/series%2fx`],
      [`/studies/${UID}\\..\\system`],
      [`/studies/${UID}/series/4.5?x`],
      ['/studies/1/2/3/4/5/6/7/8/9/10/11'],
      [`/studies/${UID}/${'a'.repeat(400)}`],
      ['/STUDIES/1.2.3'],
      ['/dicom-web/studies/1.2.3'],
    ])('refuses %j', (path) => {
      expect(parseDicomWebRequest(path, '')).toBeNull();
    });
  });

  it('recognises a DICOM UID', () => {
    expect(isDicomUid(UID)).toBe(true);
    expect(isDicomUid('1')).toBe(true);
    expect(isDicomUid('')).toBe(false);
    expect(isDicomUid('1..2')).toBe(false);
    expect(isDicomUid('.1.2')).toBe(false);
    expect(isDicomUid('1.2.a')).toBe(false);
    expect(isDicomUid('1'.repeat(64))).toBe(true);
    expect(isDicomUid('1'.repeat(65))).toBe(false);
  });
});
