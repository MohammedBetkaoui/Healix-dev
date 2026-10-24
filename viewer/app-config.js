/** @type {AppTypes.Config} */

// Configuration of the OHIF Viewer (v3.13.13) of HealixDz. Mounted read-only
// at /usr/share/nginx/html/viewer/app-config.js (docker-compose.yml): a change
// here takes effect when the page is reloaded, with no rebuild. It is also
// the file the image was built with.
//
// One data source, the DICOMweb proxy of the backend, on the same origin:
// every request carries the session cookie, and the backend lets through the
// studies of the workspace of the caller only (backend/src/dicom/dicomweb-*).
// Nothing else is configured: no other data source, no upload, no local file
// loading, no URL-driven customization, no outside server.
window.config = {
  name: 'healixdz',
  // The viewer is served under /viewer/ (PUBLIC_URL=/viewer/ at build time):
  // the router's base is the same path, without the final slash.
  routerBasename: '/viewer',
  extensions: [],
  modes: [],
  customizationService: {},

  // The studies are opened from HealixDz with ?StudyInstanceUIDs=<uid>; a list
  // of studies would ask the proxy to search, which it refuses.
  showStudyList: false,
  // No "for investigational use only" dialog at every start.
  investigationalUseDialog: { option: 'never' },
  // The pages are on the same origin as the images: nothing to warn about.
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  // Error details only in a development build.
  showErrorDetails: 'dev',
  // Some Windows machines have trouble with more than 3 decoding workers.
  maxNumberOfWebWorkers: 3,
  maxNumRequests: {
    interaction: 100,
    thumbnail: 5,
    prefetch: 25,
  },

  defaultDataSourceName: 'healixdz',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'healixdz',
      configuration: {
        friendlyName: 'HealixDz',
        name: 'HealixDz',
        // Relative to the origin: the proxy of the backend, behind Caddy.
        qidoRoot: '/api/dicomweb',
        wadoRoot: '/api/dicomweb',
        wadoUriRoot: '/api/dicomweb',
        // Images and thumbnails are read frame by frame (WADO-RS), the way
        // the official configuration for Orthanc does it.
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        // Series metadata when a series is opened, not the whole study first.
        enableStudyLazyLoad: true,
        // Orthanc's QIDO-RS does not take includefield.
        qidoSupportsIncludeField: false,
        supportsFuzzyMatching: false,
        supportsWildcard: false,
        // Orthanc wants the multipart Accept header without quotation marks
        // (the official configuration for Orthanc sets it too).
        omitQuotationForMultipartRequest: true,
        // Orthanc writes absolute URLs in its answers, with the host it is
        // reached by (orthanc:8042, see AllowedHosts in docker-compose.yml)
        // and the public base path of the proxy (PublicRoot): kept in the
        // browser's own origin.
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
          startsWith: 'http://orthanc:8042/api/dicomweb',
          prefixWith: '/api/dicomweb',
        },
      },
    },
  ],

  // The default handler of the viewer only logs; the proxy answers 502 when
  // Orthanc is down and 404 for anything outside the workspace.
  httpErrorHandler: error => {
    console.warn(`HTTP Error Handler (status: ${error.status})`, error);
  },
};
