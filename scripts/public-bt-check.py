"""Opt-in public BT acceptance of an explicit local delivery, never a GUI."""
from pathlib import Path
import hashlib,json,os,shutil,struct,subprocess,sys,time,zipfile
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parent.parent
report=Path(sys.argv[1]).resolve()
delivery=Path(sys.argv[3]) if len(sys.argv)>3 else Path(r'E:\ai\拾影\0.4.7-BT优化预览')
record=json.loads((delivery/'文件校验.json').read_text(encoding='utf-8'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
installer=delivery/next(item['file'] for item in record['products'] if item['file'].endswith('.exe'))
assert sha(installer)==next(p['sha256'] for p in record['products'] if p['file']==installer.name)
payload=root/'desktop/setup-payload.zip'
assert installer.read_bytes().count(payload.read_bytes())==1
app=report/'app';app.mkdir(exist_ok=True)
with zipfile.ZipFile(payload) as z:
    manifest=json.loads(z.read('payload-manifest.json'))
    for item in manifest['files']:
        path=Path(item['Path']);assert not path.is_absolute() and '..' not in path.parts
        data=z.read(item['Path']);assert hashlib.sha256(data).hexdigest()==item['Sha256']
        target=app/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
assert sha(app/'拾影.exe')==record['desktopSha256']
# Parse the public inventory for a readable audit; the product validates it again.
def decode(data):
    def read(at):
        marker=data[at:at+1]
        if marker==b'i':end=data.index(b'e',at);return int(data[at+1:end]),end+1
        if marker in (b'd',b'l'):
            result={} if marker==b'd' else [];at+=1
            while data[at:at+1]!=b'e':
                value,at=read(at)
                if isinstance(result,dict):other,at=read(at);result[value]=other
                else:result.append(value)
            return result,at+1
        end=data.index(b':',at);length=int(data[at:end]);return data[end+1:end+1+length],end+1+length
    return read(0)[0]
metadata_path=report/'metadata.torrent' if (report/'metadata.torrent').exists() else report/'sintel.torrent'
metadata=decode(metadata_path.read_bytes());info=metadata[b'info']
inventory=[{'index':i+1,'path':'/'.join(p.decode('utf-8') for p in f[b'path']),'bytes':f[b'length']} for i,f in enumerate(info.get(b'files',[]))]
if not inventory:inventory=[{'index':1,'path':info[b'name'].decode('utf-8'),'bytes':info[b'length']}]
print(json.dumps({'files':inventory,'webSeeds':metadata.get(b'url-list',[]),'announce':metadata.get(b'announce-list',[])},default=lambda x:x.decode('utf-8'),ensure_ascii=False),flush=True)
(report/'inventory.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf-8')
compiler=Path(os.environ['WINDIR'])/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
binary=app/'Public.Bt.Check.exe'
refs=['System','System.Core','System.Security','System.Windows.Forms','System.Web.Extensions']
shutil.copyfile(root/'scripts/public-bt-check.cs',report/'public-bt-check.cs')
shutil.copyfile(root/'scripts/public-bt-check.py',report/'public-bt-check.py')
subprocess.run([str(compiler),'/nologo','/target:exe','/platform:x64','/utf8output','/out:'+str(binary),'/r:'+str(app/'拾影.exe'),*['/r:'+r+'.dll' for r in refs],str(report/'public-bt-check.cs')],check=True,creationflags=subprocess.CREATE_NO_WINDOW)
stages=[sys.argv[2]] if len(sys.argv)>2 and sys.argv[2] in ('peer-probe','small-selection') else ['pause-resume','restart-finish']
for stage in stages:
    child=subprocess.Popen([str(binary),str(report),stage,record['desktopVersion']],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',creationflags=subprocess.CREATE_NO_WINDOW)
    with (report/(stage+'.log')).open('w',encoding='utf-8') as log:
        for line in child.stdout:print(line,end='',flush=True);log.write(line);log.flush()
    if child.wait()!=0:print(json.dumps({'ok':False,'stage':stage,'report':str(report)},ensure_ascii=False));sys.exit(1)
parts=[json.loads((report/(stage+'.json')).read_text(encoding='utf-8-sig')) for stage in stages]
result={'ok':all(p['ok'] for p in parts),'version':record['desktopVersion'],'desktopSha256':record['desktopSha256'],'resource':json.loads((report/'resource-source.json').read_text(encoding='utf-8')),'parts':parts,'screenOrMouseControlled':False,'personalInstallationChanged':False,'published':False}
(report/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'ok':result['ok'],'report':str(report)},ensure_ascii=False))
