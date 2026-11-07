# 0.4.69: the extension's "最近下载" opens a finished desktop download through the native host ({action:'open', id}).
# Runs the real Ruxget.exe as Chrome would (origin argument, framed stdin/stdout) in a throwaway folder with its own
# native-host.json and data\tasks.json. Nothing is launched: RUXGET_OPEN_RECORD makes the host note the path it would
# open (Windows 11 shows an "open with" dialog even for types no app handles, so a real launch can't stay invisible).
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$tmp=if($env:RUXGET_TMP){$env:RUXGET_TMP}else{[IO.Path]::GetTempPath()}
$report=Join-Path $tmp ('ruxget-native-open-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path (Join-Path $report 'data') -Force | Out-Null
foreach($name in 'Ruxget.exe','Shiying.Interface.dll','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll'){Copy-Item (Join-Path $root ('desktop\'+$name)) $report}
$origin='chrome-extension://abcdefghijklmnopabcdefghijklmnop/'
[IO.File]::WriteAllText((Join-Path $report 'native-host.json'),'{"name":"org.shiying.desktop","allowed_origins":["'+$origin+'"]}')
$saved=Join-Path $report 'saved'; New-Item -ItemType Directory $saved | Out-Null
$file=Join-Path $saved 'video.ruxgetopentest'; [IO.File]::WriteAllBytes($file,[byte[]](1..64))
$missing=Join-Path $saved 'gone.ruxgetopentest'
$jobs=@(
  @{Id='0123456789abcdef';Url='https://files.example.com/path/video?token=secret';Title='video';Kind='file';Status='已完成';File=$file},
  @{Id='1111111111111111';Url='https://files.example.com/gone';Title='gone';Kind='file';Status='已完成';File=$missing},
  @{Id='2222222222222222';Url='https://files.example.com/running';Title='running';Kind='file';Status='下载中';File=''}
)
Add-Type -AssemblyName System.Web.Extensions
$json=New-Object System.Web.Script.Serialization.JavaScriptSerializer
[IO.File]::WriteAllText((Join-Path $report 'data\tasks.json'),(ConvertTo-Json -InputObject $jobs -Compress),[Text.UTF8Encoding]::new($false))

function Ask($message){
  # Files, not Process.StandardInput: .NET writes a UTF-8 byte-order mark in front of the frame there.
  $in=Join-Path $report 'frame-in.bin';$outFile=Join-Path $report 'frame-out.bin'
  $body=[Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $message -Compress))
  [IO.File]::WriteAllBytes($in,[BitConverter]::GetBytes($body.Length)+$body)
  $p=Start-Process -FilePath (Join-Path $report 'Ruxget.exe') -ArgumentList $origin -WorkingDirectory $report -RedirectStandardInput $in -RedirectStandardOutput $outFile -PassThru
  if(-not $p.WaitForExit(15000)){$p.Kill();throw 'native host did not exit'}
  $bytes=[IO.File]::ReadAllBytes($outFile);$len=[BitConverter]::ToInt32($bytes,0)
  if($bytes.Length -ne $len+4){throw 'bad reply frame'}
  return $json.DeserializeObject([Text.Encoding]::UTF8.GetString($bytes,4,$len))
}
$checks=0
function Check($ok,$name){if(-not $ok){throw "FAIL $name"};$script:checks++;Write-Host "PASS $name"}

$before=@(Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($report,[StringComparison]::OrdinalIgnoreCase) }).Count
$env:RUXGET_OPEN_RECORD=Join-Path $report 'opened.txt'
$r=Ask @{action='open';id='0123456789abcdef'}
$opened=if(Test-Path $env:RUXGET_OPEN_RECORD){[IO.File]::ReadAllText($env:RUXGET_OPEN_RECORD).Trim()}else{''}
Check ($r['ok'] -eq $true -and $opened -eq $file) ("a finished desktop download is opened by its saved path ("+$opened+")")
$mark=Get-Content -LiteralPath $file -Stream Zone.Identifier -ErrorAction SilentlyContinue
Check (($mark -join "`n") -match 'ZoneId=3' -and ($mark -join "`n") -match 'HostUrl=https://files.example.com/' -and -not (($mark -join "`n") -match 'token|path')) 'an unmarked file gets the "from the internet" mark (site only) before it is opened'
Check (@(Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($report,[StringComparison]::OrdinalIgnoreCase) }).Count -eq $before) 'the desktop app is not started and no window is shown'
$r=Ask @{action='open';id='1111111111111111'}
Check ($r['ok'] -eq $false -and $r['error'] -eq '文件已不在原来的位置，可能被移动或删除了') 'a moved or deleted file is explained'
$r=Ask @{action='open';id='2222222222222222'}
Check ($r['ok'] -eq $false -and $r['error'] -eq '文件还没下载完成') 'an unfinished download is not opened'
$r=Ask @{action='open';id='ffffffffffffffff'}
Check ($r['ok'] -eq $false -and $r['error'] -eq '桌面版里已经没有这个下载了') 'a download that is no longer in the desktop list is explained'
$r=Ask @{action='open';id='..\..\x'}
Check ($r['ok'] -eq $false -and $r['error'] -eq '任务标识无效') 'only a task id is accepted, never a path'
$src=[IO.File]::ReadAllText((Join-Path $root 'desktop\Shiying.cs'))
Check ($src.IndexOf('if(action=="open")') -lt $src.IndexOf('new NamedPipeClientStream')) 'opening is answered before the pipe, so it never starts the app'
Check ([IO.File]::ReadAllText($env:RUXGET_OPEN_RECORD).Trim() -eq $file) 'nothing else was opened'
# The folder button: the file is shown selected in Explorer, the same way (no app started, nothing run).
$r=Ask @{action='reveal';id='0123456789abcdef'}
$lines=[IO.File]::ReadAllLines($env:RUXGET_OPEN_RECORD)
Check ($r['ok'] -eq $true -and $lines[-1] -eq ('reveal '+$file)) ('the folder button shows a finished desktop download in its folder ('+$lines[-1]+')')
$r=Ask @{action='reveal';id='1111111111111111'}
Check ($r['ok'] -eq $false -and $r['error'] -eq '文件已不在原来的位置，可能被移动或删除了') 'the folder button explains a moved or deleted file'
$r=Ask @{action='reveal';id='2222222222222222'}
Check ($r['ok'] -eq $false -and $r['error'] -eq '文件还没下载完成') 'the folder button waits until the download is finished'
Check (@(Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($report,[StringComparison]::OrdinalIgnoreCase) }).Count -eq $before) 'still no desktop app started'
Remove-Item Env:RUXGET_OPEN_RECORD
Write-Host "NATIVE OPEN CHECKS PASSED ($checks)"
