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
    actual = re.search(r"Signer #1 certificate SHA-256 digest:\s*([0-9a-fA-F]+)", output)
    if actual is None or actual.group(1).lower() != expected:
        raise SystemExit("APK signing certificate mismatch; publication blocked.")
    print(f"Verified {variant} APK with pinned SHA-256 certificate.")
with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
    summary.write("Both APKs use the fixed signing certificate. Certificate SHA-256: `" + expected.upper() + "`.\n")
