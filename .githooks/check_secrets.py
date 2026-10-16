"""Reject staged paths that commonly contain credentials or private data.

Lo invoca .githooks/pre-commit, que elige un intérprete de Python que funcione.
"""

import subprocess
import sys
from pathlib import PurePosixPath


result = subprocess.run(
    ["git", "diff", "--cached", "--name-only", "-z"],
    check=True,
    stdout=subprocess.PIPE,
)
paths = [path.decode("utf-8", errors="surrogateescape") for path in result.stdout.split(b"\0") if path]

blocked_extensions = {
    ".pem",
    ".key",
    ".p12",
    ".pfx",
    ".p7b",
    ".p7c",
    ".p8",
    ".der",
    ".crt",
    ".cer",
    ".jks",
    ".keystore",
    ".sqlite",
    ".sqlite3",
    ".db",
    ".dump",
    ".sql",
    ".bak",
    ".backup",
    ".secret",
    ".secrets",
    ".credentials",
}
blocked_names = {
    ".env",
    ".envrc",
    ".netrc",
    ".npmrc",
    ".pypirc",
    ".pgpass",
    "id_rsa",
    "id_ed25519",
    "credentials.json",
}
blocked_directories = {".ssh", ".aws", ".cloudflared", ".kube", "secret", "secrets"}

blocked = []
for path in paths:
    normalized = path.lower()
    parsed = PurePosixPath(normalized)
    name = parsed.name
    parts = set(parsed.parts)

    is_example_env = name == ".env.example"
    is_env_file = (name == ".env" or name.startswith(".env.")) and not is_example_env
    is_credential_json = (
        name.endswith(".json")
        and (
            "credential" in name
            or name.startswith("service-account")
            or name.startswith("service_account")
            or name.startswith("cloudflared")
        )
    )
    if (
        is_env_file
        or name in blocked_names
        or parsed.suffix in blocked_extensions
        or any(part in blocked_directories for part in parts)
        or name.startswith("vapid_private")
        or is_credential_json
    ):
        blocked.append(path)

if blocked:
    print("Commit bloqueado: retira del staging estos archivos sensibles:", file=sys.stderr)
    for path in blocked:
        print(f"  {path}", file=sys.stderr)
    print("Conserva los secretos fuera de Git; los .env.example están permitidos.", file=sys.stderr)
    sys.exit(1)
