"""Real aria2/DPAPI checks using generated loopback bytes, never a user account or download."""
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import hashlib, json, shutil, subprocess, threading, time, re, sys

sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parent.parent
report=root/'reports'/('netdisk-desktop-'+time.strftime('%Y%m%d-%H%M%S'))
report.mkdir(parents=True)
body=bytes(range(256))*16384
counts={'ranges':0,'authenticated':0,'cookieLeaks':0,'redirects':0}
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        try:
            if self.path=='/redirect':
                counts['redirects']+=1;self.send_response(302);self.send_header('Location','http://localhost:'+str(self.server.server_port)+'/target');self.send_header('Content-Length','0');self.end_headers();return
            if self.path=='/login':
                self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length','20');self.end_headers();self.wfile.write(b'<html>sign in</html> ');return
            if self.path.startswith('/data') and self.path!='/data?access_token=fixture-oauth-token':self.send_error(403);return
            data=body[:16384] if self.path=='/target' else body
            if self.path=='/target':
                if self.headers.get('Cookie'):counts['cookieLeaks']+=1
            else:
                if not all(value in self.headers.get('Cookie','') for value in ['session=fixture-secret','auth=fixture-value']) or self.headers.get('User-Agent')!='FixtureNetdiskAgent' or self.headers.get('Referer')!='https://pan.quark.cn/':self.send_error(403);return
                counts['authenticated']+=1
            ranges=re.fullmatch(r'bytes=(\d+)-(\d*)',self.headers.get('Range',''))
            first=int(ranges[1]) if ranges else 0;last=min(len(data)-1,int(ranges[2])) if ranges and ranges[2] else len(data)-1
            if first>=len(data):self.send_response(416);self.send_header('Content-Range','bytes */'+str(len(data)));self.send_header('Content-Length','0');self.end_headers();return
            self.send_response(206 if ranges else 200)
            if ranges:counts['ranges']+=1;self.send_header('Content-Range',f'bytes {first}-{last}/{len(data)}')
            self.send_header('Content-Length',str(last-first+1));self.send_header('Accept-Ranges','bytes');self.send_header('ETag','"netdisk-fixture-v1"');self.send_header('Content-Type','application/octet-stream');self.end_headers()
            for offset in range(first,last+1,16384):self.wfile.write(data[offset:min(offset+16384,last+1)]);self.wfile.flush();time.sleep(.001)
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass

compiler=Path(r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe')
refs=['System','System.Core','System.Security','System.Drawing','System.Windows.Forms','System.Web.Extensions','System.IO.Compression','System.IO.Compression.FileSystem','Microsoft.CSharp']
sources=['Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs']
exe=report/'Netdisk.Check.exe'
compiled=subprocess.run([str(compiler),'/nologo','/target:exe','/platform:x64','/utf8output','/main:NetdiskCheck','/out:'+str(exe),*['/r:'+x+'.dll' for x in refs],*[str(root/'desktop'/name) for name in sources],str(root/'scripts/netdisk-check.cs')],capture_output=True,text=True,encoding='utf-8',errors='replace',creationflags=subprocess.CREATE_NO_WINDOW)
print(compiled.stdout+compiled.stderr);compiled.check_returncode()
(report/'bin').mkdir();shutil.copy2(root/'desktop/bin/aria2c.exe',report/'bin/aria2c.exe');shutil.copy2(root/'desktop/components.json',report/'components.json')
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
try:
    checked=subprocess.run([str(exe),str(report),'http://127.0.0.1:'+str(server.server_port),hashlib.sha256(body).hexdigest()],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=65,creationflags=subprocess.CREATE_NO_WINDOW)
    print(checked.stdout+checked.stderr);checked.check_returncode()
    assert counts['cookieLeaks']==0 and counts['authenticated']>1 and counts['ranges']>1 and counts['redirects']>1,counts
    (report/'server-summary.json').write_text(json.dumps({'ok':True,**counts,'generatedBytes':len(body),'publicNetworkUsed':False,'videoDownloaded':False},indent=2),encoding='utf-8')
    print('NETDISK LOOPBACK PASSED',report)
finally:server.shutdown();server.server_close()
