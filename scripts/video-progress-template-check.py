"""Validate the production JSON template through yt-dlp's formatter, without downloading."""
from pathlib import Path
import json,re,subprocess,time,sys
sys.stdout.reconfigure(encoding='utf-8')
root=Path(__file__).resolve().parent.parent
report=root/'reports'/('video-progress-format-'+time.strftime('%Y%m%d-%H%M%S'))
report.mkdir(parents=True)
source=(root/'desktop/Shiying.cs').read_text(encoding='utf-8')
literal=re.search(r'"download:progress:((?:\\.|[^"\\])*)"',source).group(1)
template=json.loads('"'+literal+'"')
results=[]
for label,progress in [('known',dict(downloaded_bytes=65536,total_bytes=262144,speed=32768.5,eta=6,fragment_index=2,fragment_count=8)),('unknown',dict(downloaded_bytes=0,total_bytes=None,speed=None,eta=None))]:
    fixture={'id':'format-fixture','title':'format fixture','extractor':'fixture','webpage_url':'http://127.0.0.1:9/not-requested','ext':'mp4','formats':[dict(format_id='fixture',url='http://127.0.0.1:9/not-requested',ext='mp4',vcodec='avc1',acodec='mp4a')],'progress':progress,'info':dict(vcodec='avc1',acodec='none')}
    info=report/(label+'.json');info.write_text(json.dumps(fixture),encoding='utf-8')
    proc=subprocess.run([str(root/'desktop/bin/yt-dlp.exe'),'--ignore-config','--no-cache-dir','--simulate','--skip-download','--no-check-formats','--load-info-json',str(info),'-f','best','--print',template],capture_output=True,text=True,encoding='utf-8',timeout=20)
    assert proc.returncode==0,(proc.stdout,proc.stderr)
    (report/(label+'-formatted.txt')).write_text(proc.stdout,encoding='utf-8')
    actual=json.loads(proc.stdout.strip());assert actual['downloaded_bytes']==progress['downloaded_bytes']
    if label=='known':assert actual['total_bytes']==262144 and actual['speed']==32768.5 and actual['fragment_count']==8
    else:assert actual['total_bytes'] is None and actual['speed'] is None
    results.append({'label':label,'formatted':actual})
(report/'summary.json').write_text(json.dumps({'ok':True,'method':'actual yt-dlp formatter with production JSON template; simulate, skip-download and no-check-formats; fixed loopback discard URL; no media/network downloads','results':results},ensure_ascii=False,indent=2),encoding='utf-8')
print('VIDEO PROGRESS FORMAT PASSED',report)
