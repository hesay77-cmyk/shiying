$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$report=Join-Path $root ('reports\window-shell-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $report | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$refs=@('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
$sources=@('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs')|ForEach-Object{Join-Path $root ('desktop\'+$_)}
$exe=Join-Path $report 'Window.Shell.Check.exe'
& $compiler /nologo /target:exe /platform:x64 /utf8output ('/win32manifest:'+(Join-Path $root 'desktop\app.manifest')) @refs /main:WindowShellCheck ('/out:'+$exe) @sources (Join-Path $PSScriptRoot 'window-shell-check.cs')
if($LASTEXITCODE -ne 0){throw 'Whole-window check compilation failed'}
& $exe $report (Join-Path $root 'desktop\Shiying.Interface.dll')
if($LASTEXITCODE -ne 0){throw "Whole-window check failed: $report"}
