import * as yauzl from 'yauzl';

import { DicomZipRefusal } from './dicom-errors';

const MiB = 1024 * 1024;

// What a DICOM import may be made of. The 512 MiB sent are also the limit of
// Caddy for this route (caddy/healixdz-site.caddy).
export const DICOM_IMPORT_LIMITS = {
  /** Files in one import (the entries of a ZIP, or the .dcm files sent). */
  maxFiles: 2000,
  /** One DICOM file: it is read whole, to be sent to Orthanc. */
  maxInstanceBytes: 512 * MiB,
  /** Declared size of everything a ZIP holds, once decompressed. */
  maxUncompressedBytes: 2048 * MiB,
  /** What is sent: the files together, or the ZIP. */
  maxUploadBytes: 512 * MiB,
} as const;

export type DicomImportLimits = {
  maxFiles: number;
  maxInstanceBytes: number;
  maxUncompressedBytes: number;
  maxUploadBytes: number;
};

// "PK\x03\x04": the first bytes of a ZIP.
export const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export type ZipMember = {
  entry: yauzl.Entry;
  /** The path inside the archive, checked by yauzl (see DicomZip.open). */
  name: string;
  size: number;
};

// A ZIP read as it is, never written to disk: the entries are listed first
// (and the archive refused as a whole if one is unsafe), then read one by one.
// A file is only ever read into memory, so its name can never place it
// anywhere; the names are still checked, because a ZIP that tries is not one
// to trust.
export class DicomZip {
  private constructor(
    private readonly zipfile: yauzl.ZipFile,
    readonly members: ZipMember[],
    private readonly limits: DicomImportLimits,
  ) {}

  // Refuses (DicomZipRefusal) an archive with:
  //  - an absolute path, a ".." segment or a backslash in a name (yauzl's
  //    own check, with strictFileNames);
  //  - a nested ZIP (by name; by content when the file is read);
  //  - an encrypted entry;
  //  - more than maxFiles files;
  //  - more than maxUncompressedBytes once decompressed. The sizes are the
  //    ones the archive declares; yauzl (validateEntrySizes) fails a read
  //    that produces more or fewer bytes than declared, so they can be
  //    trusted.
  static async open(
    path: string,
    limits: DicomImportLimits = DICOM_IMPORT_LIMITS,
  ): Promise<DicomZip> {
    let zipfile: yauzl.ZipFile;
    try {
      zipfile = await yauzl.openPromise(path, {
        autoClose: false,
        decodeStrings: true,
        strictFileNames: true,
        validateEntrySizes: true,
      });
    } catch {
      throw new DicomZipRefusal('CORRUPT');
    }

    const members: ZipMember[] = [];
    let entries = 0;
    let declaredBytes = 0;
    try {
      for await (const entry of zipfile.eachEntry()) {
        entries += 1;
        // Directories are entries too: they count, at a looser limit.
        if (entries > limits.maxFiles * 2) {
          throw new DicomZipRefusal('TOO_MANY_FILES');
        }
        if (entry.fileName.endsWith('/')) {
          continue;
        }
        if (entry.isEncrypted()) {
          throw new DicomZipRefusal('ENCRYPTED');
        }
        if (/\.zip$/i.test(entry.fileName)) {
          throw new DicomZipRefusal('NESTED_ZIP');
        }
        if (members.length >= limits.maxFiles) {
          throw new DicomZipRefusal('TOO_MANY_FILES');
        }
        declaredBytes += entry.uncompressedSize;
        if (declaredBytes > limits.maxUncompressedBytes) {
          throw new DicomZipRefusal('TOO_LARGE');
        }
        members.push({
          entry,
          name: entry.fileName,
          size: entry.uncompressedSize,
        });
      }
    } catch (error) {
      zipfile.close();
      if (error instanceof DicomZipRefusal) {
        throw error;
      }
      // yauzl names the unsafe paths in its messages.
      const message = error instanceof Error ? error.message : '';
      throw new DicomZipRefusal(
        /absolute path|relative path|invalid characters/i.test(message)
          ? 'PATH'
          : 'CORRUPT',
      );
    }

    return new DicomZip(zipfile, members, limits);
  }

  // The content of a member, or null when it cannot be a DICOM file to send:
  // larger than an instance may be, or compressed with a method yauzl cannot
  // decode. Throws DicomZipRefusal for a nested ZIP (by content) or an entry
  // that does not read back as the archive declared it.
  async read(member: ZipMember): Promise<Buffer | null> {
    if (
      member.size > this.limits.maxInstanceBytes ||
      !member.entry.canDecodeFileData()
    ) {
      return null;
    }

    const chunks: Buffer[] = [];
    let received = 0;
    try {
      const stream = await this.zipfile.openReadStreamPromise(member.entry);
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        received += chunk.length;
        if (received > member.size) {
          stream.destroy();
          throw new DicomZipRefusal('CORRUPT');
        }
        chunks.push(chunk);
      }
    } catch (error) {
      throw error instanceof DicomZipRefusal
        ? error
        : new DicomZipRefusal('CORRUPT');
    }

    const content = Buffer.concat(chunks);
    if (content.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE)) {
      throw new DicomZipRefusal('NESTED_ZIP');
    }
    return content;
  }

  close(): void {
    this.zipfile.close();
  }
}
