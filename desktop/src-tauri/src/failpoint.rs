// Crash points for the offline reliability harness. A build with the
// `e2e-harness` feature ends the process on the point named by
// HEALIX_E2E_CRASH_AT, exactly where a power cut or a kill would; every other
// build compiles `hit` to nothing.

#[cfg(feature = "e2e-harness")]
pub fn hit(point: &str) {
    if std::env::var("HEALIX_E2E_CRASH_AT").as_deref() == Ok(point) {
        // No destructor, no flush: what is not committed is gone.
        std::process::exit(137);
    }
}

#[cfg(not(feature = "e2e-harness"))]
#[inline(always)]
pub fn hit(_point: &str) {}
