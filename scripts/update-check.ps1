$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$report=Join-Path $root ('reports\update-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $report | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$refs=@('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
$sources=@('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs')|ForEach-Object{Join-Path $root ('desktop\'+$_)}
$exe=Join-Path $report 'Update.Check.exe'
& $compiler /nologo /target:exe /platform:x64 /utf8output @refs /main:UpdateCheck ('/out:'+$exe) @sources (Join-Path $PSScriptRoot 'update-check.cs')
if($LASTEXITCODE -ne 0){throw 'Update check compilation failed'}
# The real setup (build.ps1, setup-payload.py and build-setup.ps1 first) installs into a temporary folder.
$setup=Join-Path $root 'desktop\ShiyingSetup.exe'
if(-not (Test-Path $setup)){throw 'Build the setup first (desktop\build-setup.ps1)'}
& $exe $report $setup
if($LASTEXITCODE -ne 0){throw 'Update checks failed'}
