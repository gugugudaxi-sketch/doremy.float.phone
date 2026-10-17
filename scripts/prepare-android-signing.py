"""Decode private CI credentials, validate the pinned public certificate, and fail closed."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def prepare():
    bundle_text = os.environ.get("SHELL_SIGNING_BUNDLE", "").strip()
    if not bundle_text:
        raise ValueError("Set the SHELL_SIGNING_BUNDLE GitHub Actions secret before publishing APKs.")
    bundle = json.loads(bundle_text)
    fields = {key: bundle[key] for key in ("keystoreBase64", "storePassword", "keyAlias", "keyPassword")}
    if any(not isinstance(value, str) or not value or "\n" in value or "\r" in value for value in fields.values()):
        raise ValueError("Signing bundle fields are invalid.")
    if len(fields["storePassword"]) < 16 or len(fields["keyPassword"]) < 16:
        raise ValueError("Signing passwords must contain at least 16 characters.")
    key_data = base64.b64decode(fields["keystoreBase64"], validate=True)
    if not (1024 <= len(key_data) <= 32768):
        raise ValueError("Signing keystore size is invalid.")
    folder = Path(tempfile.mkdtemp(prefix="float-signing-", dir=os.environ.get("RUNNER_TEMP")))
    key_file = folder / "shell.p12"
    key_file.write_bytes(key_data)
    key_file.chmod(0o600)
    env = {**os.environ, "FLOAT_KEYTOOL_PASSWORD": fields["storePassword"]}
    cert = subprocess.run([
        "keytool", "-exportcert", "-alias", fields["keyAlias"], "-keystore", str(key_file),
        "-storepass:env", "FLOAT_KEYTOOL_PASSWORD"
    ], env=env, capture_output=True, timeout=20, check=True).stdout
    expected = Path("android-shell/signing-certificate.sha256").read_text().strip().upper()
    actual = hashlib.sha256(cert).hexdigest().upper()
    if actual != expected:
        raise ValueError("Signing certificate differs from the pinned certificate. APK publication blocked.")
    values = {
        "SHELL_KEYSTORE_FILE": str(key_file),
        "SHELL_KEYSTORE_PASSWORD": fields["storePassword"],
        "SHELL_KEY_ALIAS": fields["keyAlias"],
        "SHELL_KEY_PASSWORD": fields["keyPassword"],
    }
    if os.environ.get("GITHUB_ACTIONS") == "true":
        for value in fields.values():
            print("::add-mask::" + value)
    with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as output:
        for name, value in values.items():
            output.write(name + "=" + value + "\n")
    print("Pinned signing certificate verified: " + actual)


if __name__ == "__main__":
    try:
        prepare()
    except Exception as error:
        # Never echo bundle contents, keytool output, passwords or decoding exceptions.
        if isinstance(error, ValueError) and str(error).startswith(("Set the SHELL", "Signing certificate")):
            print(str(error), file=sys.stderr)
        else:
            print("Invalid signing bundle; check the private GitHub Actions secret.", file=sys.stderr)
        sys.exit(1)
