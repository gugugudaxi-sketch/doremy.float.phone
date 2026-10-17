"""Check both installable APK variants against the pinned signing certificate."""
import os
from pathlib import Path
import re
import subprocess

sdk = Path(os.environ.get("ANDROID_HOME") or os.environ["ANDROID_SDK_ROOT"])
tools = sorted((sdk / "build-tools").glob("*/apksigner"), key=lambda p: tuple(int(v) for v in p.parent.name.split(".") if v.isdigit()))
if not tools:
    raise SystemExit("Android apksigner not found.")
expected = Path("android-shell/signing-certificate.sha256").read_text().strip().lower()
for variant in ("debug", "release"):
    apk = Path(f"android-shell/app/build/outputs/apk/{variant}/app-{variant}.apk")
    output = subprocess.run([str(tools[-1]), "verify", "--verbose", "--print-certs", str(apk)], capture_output=True, text=True, check=True).stdout
    digests = re.findall(r"^Signer[^\r\n]* certificate SHA-256 digest:[ \t]*([0-9a-fA-F]{64})[ \t]*$", output, re.MULTILINE)
    if not digests or any(value.lower() != expected for value in digests):
        observed = ", ".join(value.upper() for value in digests) or "no recognized certificate digest"
        raise SystemExit(f"{variant} APK signing certificate mismatch ({observed}); publication blocked.")
    print(f"Verified {variant} APK with pinned SHA-256 certificate.")
with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
    summary.write("Both APKs use the fixed signing certificate. Certificate SHA-256: `" + expected.upper() + "`.\n")
