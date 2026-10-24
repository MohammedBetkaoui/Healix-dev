// Which DICOMweb requests the proxy relays. Every request must designate ONE
// study, by its StudyInstanceUID, so that the proxy can check the study is one
// of the caller's workspace. The two shapes:
//
//   /studies/{StudyInstanceUID}[/...]       WADO-RS and QIDO-RS inside a study
//   /studies?StudyInstanceUID={uid}[...]    QIDO-RS search for that one study
//
// Everything else is refused (null): /studies without a UID, /series and
// /instances at the root, a search by patient name or date, a list of UIDs, a
// path with an encoded or relative segment. The caller turns null into a 404,
// the same answer as for a study that does not exist.
export type DicomWebTarget = {
  /** What follows /dicom-web in Orthanc, query included. */
  path: string;
  studyInstanceUid: string;
};

// A DICOM UID: digits and dots, 64 characters at most.
const UID_PATTERN = /^[0-9]+(\.[0-9]+)*$/;
const MAX_UID_LENGTH = 64;
// A path segment: UIDs, keywords (metadata, frames, rendered...), a frame list
// (1,2,3), a bulk-data tag (7fe00010).
const SEGMENT_PATTERN = /^[A-Za-z0-9._,-]+$/;
const MAX_SEGMENTS = 10;
const MAX_PATH_LENGTH = 400;

// Parameters that page or shape an answer, wherever they come.
const COMMON_PARAMETERS = new Set([
  'fuzzymatching',
  'includefield',
  'limit',
  'offset',
]);
// Matching parameters that only narrow the result inside the study of the
// path (QIDO series and instances searches).
const STUDY_PARAMETERS = new Set([
  ...COMMON_PARAMETERS,
  'InstanceNumber',
  'Modality',
  'SOPInstanceUID',
  'SeriesDescription',
  'SeriesInstanceUID',
  'SeriesNumber',
]);

export function isDicomUid(value: string): boolean {
  return value.length <= MAX_UID_LENGTH && UID_PATTERN.test(value);
}

// The query string without its "?": the allowed parameters only, as sent.
function keepParameters(query: URLSearchParams, allowed: Set<string>): string {
  const kept = new URLSearchParams();
  for (const [key, value] of query) {
    if (allowed.has(key)) {
      kept.append(key, value);
    }
  }
  return kept.toString();
}

/**
 * @param path  the path after /api/dicomweb, starting with "/" (as received:
 *              nothing is decoded)
 * @param queryString  the raw query string, without "?"
 */
export function parseDicomWebRequest(
  path: string,
  queryString: string,
): DicomWebTarget | null {
  if (
    !path.startsWith('/') ||
    path.length > MAX_PATH_LENGTH ||
    path.includes('%') ||
    path.includes('\\') ||
    path.endsWith('/')
  ) {
    return null;
  }

  const segments = path.slice(1).split('/');
  if (
    segments.length > MAX_SEGMENTS ||
    segments.some((segment) => !SEGMENT_PATTERN.test(segment)) ||
    segments.some((segment) => /^\.+$/.test(segment)) ||
    segments[0] !== 'studies'
  ) {
    return null;
  }

  let query: URLSearchParams;
  try {
    query = new URLSearchParams(queryString);
  } catch {
    return null;
  }

  // QIDO-RS search for one study: /studies?StudyInstanceUID={uid}
  if (segments.length === 1) {
    const uids = query.getAll('StudyInstanceUID');
    if (uids.length !== 1 || !isDicomUid(uids[0])) {
      return null;
    }
    // Nothing else may match: a patient name, a date... would make a search
    // across studies out of a request for one.
    for (const key of query.keys()) {
      if (key !== 'StudyInstanceUID' && !COMMON_PARAMETERS.has(key)) {
        return null;
      }
    }
    const suffix = keepParameters(
      query,
      new Set([...COMMON_PARAMETERS, 'StudyInstanceUID']),
    );
    return {
      path: `/studies?${suffix}`,
      studyInstanceUid: uids[0],
    };
  }

  // Inside a study: /studies/{uid}/...
  const studyInstanceUid = segments[1];
  if (!isDicomUid(studyInstanceUid)) {
    return null;
  }
  // A StudyInstanceUID parameter here would be a second, possibly different,
  // designation of the study.
  if (query.has('StudyInstanceUID')) {
    return null;
  }
  const suffix = keepParameters(query, STUDY_PARAMETERS);
  return {
    path: `${path}${suffix ? `?${suffix}` : ''}`,
    studyInstanceUid,
  };
}
