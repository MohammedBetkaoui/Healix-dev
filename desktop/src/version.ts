// The version as the doctor reads it: "0.1.0 bêta". Every 0.x release is a
// beta, and so is a "-beta.N" pre-release ("0.1.0-beta.2" -> "0.1.0 bêta 2").
export function versionLabel(version: string): string {
  const [core = version, pre] = version.split("-", 2);
  const beta = /^beta(?:\.(\d+))?$/.exec(pre ?? "");
  if (beta) return `${core} bêta${beta[1] ? ` ${beta[1]}` : ""}`;
  if (pre) return `${core} ${pre}`;
  return core.startsWith("0.") ? `${core} bêta` : core;
}
