"""Exercise the real Windows engines against deterministic local HTTP fixtures."""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import json
import subprocess
import threading
import time
import sys
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

root = Path(__file__).resolve().parent.parent
report = root / "reports" / ("desktop-" + time.strftime("%Y%m%d-%H%M%S"))
report.mkdir(parents=True)
exe = root / "desktop" / "Shiying.Check.exe"
ffmpeg = root / "desktop" / "bin" / "ffmpeg.exe"
fixtures = report / "fixtures"
fixtures.mkdir()
subprocess.run([str(ffmpeg), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "4", "-c:v", "libx264", "-g", "24", "-c:a", "aac", "-hls_time", "1", "-hls_segment_filename", str(fixtures / "part%d.ts"), str(fixtures / "index.m3u8")], check=True)
for extra,target in [(["-an","-c:v","copy"],"video-only.mp4"),(["-vn","-c:a","copy"],"audio-only.m4a"),(["-c","copy","-tag:v","avc1","-tag:a","mp4a","-f","dash","-seg_duration","1"],"manifest.mpd")]:
    subprocess.run([str(ffmpeg),"-hide_banner","-loglevel","error","-i",str(fixtures/"index.m3u8"),*extra,target],cwd=fixtures,check=True)
(fixtures/"encryption.key").write_bytes(bytes(range(16)))
(fixtures/"key-info.txt").write_text("encryption.key\n"+str(fixtures/"encryption.key")+"\n00112233445566778899aabbccddeeff\n",encoding="utf-8")
subprocess.run([str(ffmpeg),"-hide_banner","-loglevel","error","-i",str(fixtures/"index.m3u8"),"-c","copy","-hls_time","1","-hls_key_info_file",str(fixtures/"key-info.txt"),"-hls_segment_filename",str(fixtures/"encrypted%d.ts"),str(fixtures/"encrypted.m3u8")],check=True)
payload = bytes(range(256)) * (128 * 1024)  # 32 MiB, exact SHA-256 fixture.
requests = []
changed_probes = 0

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        global changed_probes
        requests.append({"path": self.path, "range": self.headers.get("Range"), "at": time.monotonic()})
        if self.path == "/redirect":
            self.send_response(302); self.send_header("Location", "/plain.bin"); self.send_header("Content-Length", "0"); self.end_headers(); return
        if self.path == "/missing":
            self.send_error(404); return
        if self.path == "/slow.bin":
            time.sleep(8)
        name = self.path.split("?")[0].lstrip("/")
        if self.path in ("/file.bin", "/changes.bin"): data, ranged = payload, True
        elif self.path in ("/plain.bin", "/named", "/slow.bin"): data, ranged = payload[:300000], False
        elif (fixtures/name).resolve().is_relative_to(fixtures.resolve()) and (fixtures/name).is_file(): data, ranged = (fixtures/name).read_bytes(), True
        else: self.send_error(404); return
        start, end = 0, len(data) - 1
        if ranged and self.headers.get("Range"):
            left, right = self.headers["Range"].removeprefix("bytes=").split("-")
            start, end = int(left), int(right) if right else end
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{len(data)}")
        else: self.send_response(200)
        self.send_header("Content-Length", str(end-start+1))
        if self.path == "/named": self.send_header("Content-Disposition", "attachment; filename*=UTF-8''%E6%8B%BE%E5%BD%B1%E6%B5%8B%E8%AF%95.zip")
        mime={".m3u8":"application/vnd.apple.mpegurl",".mpd":"application/dash+xml",".ts":"video/mp2t",".mp4":"video/mp4",".m4a":"audio/mp4"}.get(Path(name).suffix,"application/octet-stream")
        self.send_header("Content-Type",mime)
        if self.path == "/changes.bin" and self.headers.get("Range") == "bytes=0-0": changed_probes += 1
        self.send_header("ETag", '"fixture-v2"' if self.path == "/changes.bin" and changed_probes > 1 else '"fixture-v1"')
        if ranged: self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        try:
            for offset in range(start, end+1, 65536):
                self.wfile.write(data[offset:min(offset+65536,end+1)])
                if self.path in ("/file.bin", "/changes.bin"): time.sleep(.04)
                if self.path == "/video-only.mp4": time.sleep(.25)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError): pass
    def log_message(self, *args): pass

server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}"
results = []

def run(label, path, kind="file", pause=False, succeeds=True, directory=None, pause_mode="restart"):
    target = directory or report / label
    args = [str(exe), "--download-test", base+path, str(target), kind]
    if pause: args.append(pause_mode)
    process = subprocess.run(args, capture_output=True, timeout=110)
    stdout = process.stdout.decode("utf-8", "replace").strip()
    error = process.stderr.decode("utf-8", "replace").strip()
    if succeeds:
        assert process.returncode == 0, (label, stdout, error)
        result = json.loads(stdout)
        assert result["ok"] and Path(result["file"]).is_file(), result
        result.update(label=label, sha256=hashlib.sha256(Path(result["file"]).read_bytes()).hexdigest())
    else:
        assert process.returncode != 0, (label, stdout)
        assert not list((target / "files").glob("*")), "failed task published a file"
        if label == "changed-source":
            saved = json.loads((target / "state" / "tasks.json").read_text(encoding="utf-8"))
            assert "源文件已变化" in saved[-1]["Error"], saved[-1]
        result = {"label":label,"failed_as_expected":True,"error":error[-500:]}
    results.append(result)
    print(json.dumps(result,ensure_ascii=False), flush=True)
    return result

def gui_check():
    gui=subprocess.run([str(exe),"--gui-download-test",base+"/plain.bin",str(report/"real-gui-download")],capture_output=True,timeout=55)
    assert gui.returncode == 0,gui.stderr.decode("utf-8","replace")
    result=json.loads(gui.stdout)
    assert result["ok"] and result["clickedRealStartButton"]
    assert hashlib.sha256(Path(result["file"]).read_bytes()).hexdigest() == hashlib.sha256(payload[:300000]).hexdigest()
    return {"label":"real-gui-start-to-complete",**result}

if "--gui-only" in sys.argv:
    try:
        result=gui_check()
        (report/"gui-summary.json").write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
        print(json.dumps(result,ensure_ascii=False),flush=True)
        print("GUI CHECK PASSED",report,flush=True)
    finally: server.shutdown()
    sys.exit(0)

def streams_check():
    for label,url,kind in [("hls","/index.m3u8","video"),("dash","/manifest.mpd","video"),("aes128-hls","/encrypted.m3u8","video"),("selected-track-merge","/track-fixture","tracks-fixture"),("mp3","/index.m3u8","audio")]:
        item=run(label,url,kind=kind)
        if kind=="tracks-fixture": assert item["progressObserved"],"video progress remained at zero during download"
        if kind=="audio": assert Path(item["file"]).suffix==".mp3"
        subprocess.run([str(ffmpeg),"-hide_banner","-loglevel","error","-xerror","-err_detect","explode","-i",item["file"],"-f","null","-"],check=True,capture_output=True)

if "--streams-only" in sys.argv:
    try:
        streams_check()
        (report/"summary.json").write_text(json.dumps({"ok":True,"scope":"streams-only","cases":results,"http_requests":requests},ensure_ascii=False,indent=2),encoding="utf-8")
        print("STREAM CHECKS PASSED",report,flush=True)
    finally: server.shutdown()
    sys.exit(0)

try:
    item = run("range-restart", "/file.bin", pause=True)
    assert item["resumed"] and item["sha256"] == hashlib.sha256(payload).hexdigest()
    ranges = [r for r in requests if r["path"] == "/file.bin" and r["range"]]
    assert any(int(r["range"].split("=")[1].split("-")[0]) > 0 for r in ranges), ranges
    run("changed-source", "/changes.bin", pause=True, succeeds=False)
    item = run("range-live-resume", "/file.bin", pause=True, pause_mode="same-process")
    assert item["resumed"] and item["sha256"] == hashlib.sha256(payload).hexdigest()
    first = run("plain", "/plain.bin")
    second = run("plain-second", "/plain.bin", directory=report / "plain")
    assert first["file"] != second["file"]
    assert first["sha256"] == second["sha256"] == hashlib.sha256(payload[:300000]).hexdigest()
    item = run("redirect", "/redirect")
    assert item["sha256"] == first["sha256"]
    item = run("server-filename", "/named")
    assert Path(item["file"]).name == "拾影测试.zip" and item["sha256"] == first["sha256"]
    lifecycle=subprocess.run([str(exe), "--lifecycle-test", base+"/slow.bin", str(report/"lifecycle")],capture_output=True,timeout=25)
    assert lifecycle.returncode == 0, lifecycle.stderr.decode("utf-8","replace")
    results.append({"label":"slow-network-lifecycle",**json.loads(lifecycle.stdout)})
    invalid=report/"invalid-engine"; (invalid/"bin").mkdir(parents=True)
    (invalid/"Check.exe").write_bytes(exe.read_bytes())
    for binary in ("yt-dlp.exe","ffmpeg.exe","node.exe"): (invalid/"bin"/binary).write_bytes(b"invalid executable fixture")
    failure=subprocess.run([str(invalid/"Check.exe"),"--engine-failure-test",base+"/index.m3u8",str(invalid)],capture_output=True,timeout=10)
    assert failure.returncode == 0,failure.stderr.decode("utf-8","replace")
    results.append({"label":"invalid-engine-retry","ok":True})
    results.append(gui_check())
    run("missing", "/missing", succeeds=False)
    streams_check()
    (report / "summary.json").write_text(json.dumps({"ok":True,"cases":results,"http_requests":requests},ensure_ascii=False,indent=2),encoding="utf-8")
    print("ALL PASSED", report, flush=True)
finally: server.shutdown()
