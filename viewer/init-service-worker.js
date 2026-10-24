// Replaces OHIF's init-service-worker.js, which registers a service worker that
// pulls Workbox from a Google storage bucket. HealixDz's viewer registers no
// service worker and loads nothing from outside: this only removes one that an
// earlier build may have left in the browser.
navigator.serviceWorker?.getRegistrations().then(function (registrations) {
  for (const registration of registrations) {
    registration.unregister();
  }
});
