"""Build the small local setup payload. Video binaries are deliberately absent."""
from pathlib import Path
import base64,hashlib,json,re,shutil,struct,subprocess,uuid,zipfile,sys
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parent.parent
desktop=root/'desktop'
files=[desktop/name for name in ['Ruxget.exe','README.md','components.json','identity.json','bin/aria2c.exe','Shiying.Interface.dll','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll']]
files+=sorted((desktop/'licenses').glob('*'))
components=json.loads((desktop/'components.json').read_text(encoding='utf-8'))['components']
core=next(c for c in components if c['name']=='aria2c.exe')
assert core['bundled'] and (desktop/'bin/aria2c.exe').stat().st_size==core['bytes']
assert hashlib.sha256((desktop/'bin/aria2c.exe').read_bytes()).hexdigest()==core['sha256']
extension=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
digest=hashlib.sha256(base64.b64decode(extension['key'])).hexdigest()[:32]
stable=''.join(chr(97+int(c,16)) for c in digest)
assert stable==json.loads((desktop/'identity.json').read_text(encoding='utf-8'))['extensionId']
# Check the actual GUI binary through its ping-only route before embedding it.
# This catches stale output, including Windows PowerShell 5 misreading a UTF-8 filename.
version=re.search(r'public const string Version="([^"]+)"',(desktop/'Shiying.cs').read_text(encoding='utf-8')).group(1)
check=root/'reports'/('payload-binary-'+uuid.uuid4().hex);check.mkdir(parents=True)
binary=check/'Release.Check.exe';shutil.copy2(desktop/'Ruxget.exe',binary)
origin='chrome-extension://'+stable+'/'
(check/'native-host.json').write_text(json.dumps({'allowed_origins':[origin]}),encoding='utf-8')
message=json.dumps({'action':'ping'}).encode()
result=subprocess.run([str(binary),origin],input=struct.pack('<I',len(message))+message,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10,creationflags=subprocess.CREATE_NO_WINDOW)
assert result.returncode==0 and len(result.stdout)>=4, 'Desktop ping failed'
assert struct.unpack('<I',result.stdout[:4])[0]==len(result.stdout)-4
reply=json.loads(result.stdout[4:]);assert reply.get('ok') and reply.get('version')==version, 'Desktop binary is stale; rebuild desktop/build.ps1'
(check/'summary.json').write_text(json.dumps({'ok':True,'version':version,'sha256':hashlib.sha256(binary.read_bytes()).hexdigest(),'method':'actual GUI binary native ping only; hidden process; no desktop IPC, browser, registry, window or download'},indent=2),encoding='utf-8')
payload=desktop/'setup-payload.zip'
manifest={'files':[{'Path':p.relative_to(desktop).as_posix(),'Sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
manifest['files'].append({'Path':'LICENSE','Sha256':hashlib.sha256((root/'LICENSE').read_bytes()).hexdigest()})
with zipfile.ZipFile(payload,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in files:z.write(p,p.relative_to(desktop).as_posix())
    z.write(root/'LICENSE','LICENSE')
    z.writestr('payload-manifest.json',json.dumps(manifest,ensure_ascii=False))
with zipfile.ZipFile(payload) as z:
    assert z.testzip() is None
    assert all('data/' not in name for name in z.namelist())
    assert [name for name in z.namelist() if name.startswith('bin/')]==['bin/aria2c.exe']
print(json.dumps({'payload':str(payload),'bytes':payload.stat().st_size,'videoBinariesBundled':False},ensure_ascii=False))
