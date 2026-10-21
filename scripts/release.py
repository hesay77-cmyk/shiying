"""Build clean Chrome/source ZIPs with the Python standard library."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "manifest.json").read_text(encoding="utf-8"))["version"]
release = root / "release"
release.mkdir(exist_ok=True)
excluded = {".git", "build", "dist", "release", "reports", ".checks", "node_modules", "__pycache__", "bin", "data"}
products = []
for label, base in [("Chrome", root / "build"), ("源码", root)]:
    target = release / f"拾影-{version}-{label}.zip"
    if target.exists():
        raise FileExistsError(f"Preserving existing release: {target}")
    files = [p for p in base.rglob("*") if p.is_file() and p.name != "setup-payload.zip" and not p.name.startswith("native-host.json") and p.suffix.lower() != ".exe" and not any(part in excluded for part in p.relative_to(base).parts)]
    if not files:
        raise RuntimeError("Run node scripts/package.cjs first")
    with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for file in sorted(files):
            output.write(file, file.relative_to(base).as_posix())
    products.append({"file": str(target), "bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
(release / f"拾影-{version}-文件校验.json").write_text(json.dumps({"version": version, "native": True, "products": products}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"version": version, "products": products}, ensure_ascii=False, indent=2))
