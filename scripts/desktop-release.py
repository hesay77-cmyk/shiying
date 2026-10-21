"""Package an explicit local desktop preview; never include data or test profiles."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

root = Path(__file__).resolve().parent.parent
desktop = root / "desktop"
version = re.search(r'public const string Version="([^"]+)"', (desktop / "Shiying.cs").read_text(encoding="utf-8")).group(1)
manifest = json.loads((desktop / "components.json").read_text(encoding="utf-8"))
for component in manifest["components"]:
    binary = desktop / "bin" / component["name"]
    if hashlib.sha256(binary.read_bytes()).hexdigest() != component["sha256"]:
        raise RuntimeError("Component hash mismatch: " + str(binary))
target = root / "release" / f"拾影-{version}-Windows桌面预览.zip"
target.parent.mkdir(exist_ok=True)
files = [desktop / "拾影.exe", desktop / "README.md", desktop / "components.json", desktop / "identity.json"]
files += [desktop / name for name in ["Shiying.Interface.dll", "Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll", "WebView2Loader.dll"]]
files += sorted((desktop / "bin").glob("*.exe"))
files += sorted((desktop / "licenses").glob("*"))
if any(not file.is_file() for file in files):
    raise RuntimeError("Desktop payload is incomplete")
with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for file in files:
        archive.write(file, file.relative_to(desktop))
    archive.write(root / "LICENSE", "LICENSE")
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    names = set(archive.namelist())
    assert "拾影.exe" in names and "bin/aria2c.exe" in names
    assert not any("data/" in name or "native-host" in name or "reports/" in name or "Check.exe" in name for name in names)
result = {"version":version,"channel":"local-preview","file":str(target),"bytes":target.stat().st_size,"sha256":hashlib.sha256(target.read_bytes()).hexdigest(),"files":len(names),"signed":False,"published":False}
(target.parent / f"拾影-{version}-桌面文件校验.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(result,ensure_ascii=False,indent=2))
