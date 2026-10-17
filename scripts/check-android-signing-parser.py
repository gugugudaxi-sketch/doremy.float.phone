"""Regression fixtures for the actual APK certificate parser (no private keys)."""
import ast
from pathlib import Path
import re

tree = ast.parse(Path("scripts/verify-android-apks.py").read_text())
call = next(node for node in ast.walk(tree) if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute) and node.func.attr == "findall")
pattern = ast.literal_eval(call.args[0])
digest = "87702d7cc8ff2f07af52a9ca6c26dc47a9d171704165b4ca210e305f52810dc3"
for label in ("Signer #1", "Signer (minSdkVersion=26, maxSdkVersion=2147483647)", "V2 Signer:", "V3.1 Signer:"):
    output = "Number of signers: 1\n" + label + " certificate SHA-256 digest: " + digest + "\n"
    assert re.findall(pattern, output, re.MULTILINE) == [digest], label
assert not re.findall(pattern, "V2 Signer: public key SHA-256 digest: " + digest, re.MULTILINE)
assert not re.findall(pattern, "Source Stamp certificate SHA-256 digest: " + digest, re.MULTILINE)
other = "b" * 64
assert re.findall(pattern, "V2 Signer: certificate SHA-256 digest: " + other, re.MULTILINE) == [other]
print("PASS signing parser: numbered, SDK-range, V2/V3.1 certificates; excludes public-key and stamp hashes.")
