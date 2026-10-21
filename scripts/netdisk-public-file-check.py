"""Download only the public font selected by the preceding isolated-browser run, at 256 KiB/s."""
from pathlib import Path
import json, re, shutil, subprocess, sys, time
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parent.parent
browser=Path(sys.argv[1]).resolve()
assert browser.parent==root/'reports' and browser.name.startswith('netdisk-public-extension-')
observed=json.loads((browser/'summary.json').read_text(encoding='utf-8'))
font=next(row for row in observed['results'] if row['project']=='QiushuiShotai')['chosen']
assert font['name']=='QiushuiShotai.woff2' and 0<font['size']<=10*1024*1024 and re.fullmatch('[a-f0-9]{32}',font['etag'])
payload=browser/'private-public-handoff.json';message=json.loads(payload.read_text(encoding='utf-8'))
assert len(message)==1 and len(message[0]['files'])==1 and message[0]['files'][0]['title']==font['name'] and message[0]['files'][0]['size']==font['size']
report=root/'reports'/('netdisk-public-file-'+time.strftime('%Y%m%d-%H%M%S'));report.mkdir()
compiler=Path(r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe')
references=['System','System.Core','System.Security','System.Drawing','System.Windows.Forms','System.Web.Extensions','System.IO.Compression','System.IO.Compression.FileSystem','Microsoft.CSharp']
sources=['Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs']
exe=report/'Public.Font.Check.exe'
compiled=subprocess.run([str(compiler),'/nologo','/target:exe','/platform:x64','/utf8output','/main:NetdiskPublicFileCheck','/out:'+str(exe),*['/r:'+x+'.dll' for x in references],*[str(root/'desktop'/name) for name in sources],str(root/'scripts/netdisk-public-file-check.cs')],capture_output=True,text=True,encoding='utf-8',errors='replace',creationflags=subprocess.CREATE_NO_WINDOW)
if compiled.returncode:print(compiled.stdout+compiled.stderr)
compiled.check_returncode()
(report/'bin').mkdir();shutil.copy2(root/'desktop/bin/aria2c.exe',report/'bin/aria2c.exe');shutil.copy2(root/'desktop/components.json',report/'components.json')
print('PUBLIC FONT CHECK STARTED',report,flush=True)
checked=subprocess.run([str(exe),str(report),str(payload),font['etag']],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=180,creationflags=subprocess.CREATE_NO_WINDOW)
print(checked.stdout+checked.stderr);checked.check_returncode()
print('PUBLIC FONT CHECK PASSED',report)
