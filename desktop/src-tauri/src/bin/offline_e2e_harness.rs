// Command-line entry of the offline reliability harness; see e2e_harness.rs.
fn main() {
    std::process::exit(healixdz_desktop_lib::e2e_harness::run(
        std::env::args().skip(1).collect(),
    ));
}
