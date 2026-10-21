"""Validate the exact real public Quark handoff through an isolated actual desktop engine."""
from pathlib import Path
import json,shutil,subprocess,sys,time
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parent.parent
browser=Path(sys.argv[1]).resolve()
assert browser.parent==root/'reports' and browser.name.startswith('netdisk-public-baidu-quark-')
observed=json.loads((browser/'summary.json').read_text(encoding='utf-8'))['results']
case=next(row for row in observed if row['project']=='Metradar-resources')
assert case['chosen']['name']=='bou1_4l.shx' and case['chosen']['size']==11156 and case['handoff'][0]['provider']=='quark'
payload=browser/'private-public-handoff.json'
data=json.loads(payload.read_text(encoding='utf-8'));assert len(data)==1 and len(data[0]['files'])==1
report=root/'reports'/('netdisk-public-quark-download-'+time.strftime('%Y%m%d-%H%M%S'));report.mkdir()
compiler=Path(r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe')
refs=['System','System.Core','System.Security','System.Drawing','System.Windows.Forms','System.Web.Extensions','System.IO.Compression','System.IO.Compression.FileSystem','Microsoft.CSharp']
sources=['Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs']
exe=report/'Public.Quark.Check.exe'
compiled=subprocess.run([str(compiler),'/nologo','/target:exe','/platform:x64','/utf8output','/main:NetdiskPublicQuarkCheck','/out:'+str(exe),*['/r:'+x+'.dll' for x in refs],*[str(root/'desktop'/name) for name in sources],str(root/'scripts/netdisk-public-quark-check.cs')],capture_output=True,text=True,encoding='utf-8',errors='replace',creationflags=subprocess.CREATE_NO_WINDOW)
if compiled.returncode:print(compiled.stdout+compiled.stderr)
compiled.check_returncode()
(report/'bin').mkdir();shutil.copy2(root/'desktop/bin/aria2c.exe',report/'bin/aria2c.exe');shutil.copy2(root/'desktop/components.json',report/'components.json')
print('PUBLIC QUARK CHECK STARTED',report,flush=True)
checked=subprocess.run([str(exe),str(report),str(payload)],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=100,creationflags=subprocess.CREATE_NO_WINDOW)
print(checked.stdout+checked.stderr);checked.check_returncode()
print('PUBLIC QUARK CHECK PASSED',report)
