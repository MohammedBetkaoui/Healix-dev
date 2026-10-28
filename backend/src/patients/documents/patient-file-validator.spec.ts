import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PatientDocumentType } from '../../common/enums/patient-document-type.enum';
import { PatientFileValidator } from './patient-file-validator';

const validator = new PatientFileValidator({
  get: () => undefined,
} as unknown as ConfigService);

const fileOf = (
  originalname: string,
  mimetype: string,
  content: Buffer | string,
): Express.Multer.File =>
  ({
    buffer: Buffer.isBuffer(content) ? content : Buffer.from(content),
    mimetype,
    originalname,
    size: Buffer.isBuffer(content) ? content.length : content.length,
  }) as Express.Multer.File;

const CSV = 'I,II,III\n0.1,0.2,0.1\n';
const ZIP = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.alloc(20),
]);
// A real PNG: the first bytes hold its signature (the validator checks the
// declared type against the content, not just against the extension).
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);
const { ECG_SIGNAL, MEDICAL_IMAGE } = PatientDocumentType;

describe('PatientFileValidator, ECG signals', () => {
  it('accepts a CSV, a TXT and a zip as an ECG_SIGNAL, stored under one MIME type each', () => {
    expect(
      validator.validate(fileOf('ecg.csv', 'text/csv', CSV), ECG_SIGNAL),
    ).toEqual({ extension: '.csv', mimeType: 'text/csv' });
    // Windows with Excel installed sends a CSV as application/vnd.ms-excel.
    expect(
      validator.validate(
        fileOf('ECG.CSV', 'application/vnd.ms-excel', CSV),
        ECG_SIGNAL,
      ),
    ).toEqual({ extension: '.csv', mimeType: 'text/csv' });
    expect(
      validator.validate(fileOf('ecg.txt', 'text/plain', CSV), ECG_SIGNAL),
    ).toEqual({ extension: '.txt', mimeType: 'text/plain' });
    expect(
      validator.validate(
        fileOf('record.zip', 'application/x-zip-compressed', ZIP),
        ECG_SIGNAL,
      ),
    ).toEqual({ extension: '.zip', mimeType: 'application/zip' });
  });

  it('checks the content: a zip signature, a text without NUL byte', () => {
    const refused = [
      fileOf('record.zip', 'application/zip', Buffer.from('not a zip')),
      fileOf('ecg.csv', 'text/csv', Buffer.from([0x49, 0x00, 0x2c])),
      fileOf('ecg.csv', 'text/csv', ''),
    ];
    for (const file of refused) {
      expect(() => validator.validate(file, ECG_SIGNAL)).toThrow(
        UnsupportedMediaTypeException,
      );
    }
  });

  it('refuses any other file as an ECG_SIGNAL, and a mismatched MIME type', () => {
    const refused = [
      fileOf('ecg.png', 'image/png', 'png'),
      fileOf('ecg.pdf', 'application/pdf', '%PDF'),
      fileOf('ecg.csv', 'application/zip', CSV),
      fileOf('record.zip', 'text/csv', ZIP),
      fileOf('ecg.dat', 'application/octet-stream', 'data'),
    ];
    for (const file of refused) {
      expect(() => validator.validate(file, ECG_SIGNAL)).toThrow(
        UnsupportedMediaTypeException,
      );
    }
  });

  it('accepts signal files only as an ECG_SIGNAL', () => {
    for (const file of [
      fileOf('ecg.csv', 'text/csv', CSV),
      fileOf('record.zip', 'application/zip', ZIP),
      fileOf('ecg.txt', 'text/plain', CSV),
    ]) {
      expect(() => validator.validate(file, MEDICAL_IMAGE)).toThrow(
        UnsupportedMediaTypeException,
      );
    }
    expect(
      validator.validate(fileOf('irm.png', 'image/png', PNG), MEDICAL_IMAGE),
    ).toEqual({ extension: '.png', mimeType: 'image/png' });
  });

  it('keeps the size limit for every type', () => {
    const large = fileOf('ecg.csv', 'text/csv', CSV);
    large.size = 21 * 1024 * 1024;
    expect(() => validator.validate(large, ECG_SIGNAL)).toThrow(
      PayloadTooLargeException,
    );
  });
});
