param([switch]$RecoveryOnly)
$ErrorActionPreference = 'Stop'
$startupRoot = Split-Path -Parent $PSScriptRoot
$startupReport = Join-Path $startupRoot ('reports\startup-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $startupReport | Out-Null
$startupCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$startupReferences = @('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
$startupSources = @('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs') | ForEach-Object { Join-Path $startupRoot ('desktop\' + $_) }
$startupExe = Join-Path $startupReport 'Startup.Check.exe'
& $startupCompiler /nologo /target:exe /platform:x64 /utf8output @startupReferences /main:StartupCheck ('/out:' + $startupExe) @startupSources (Join-Path $PSScriptRoot 'startup-check.cs')
if ($LASTEXITCODE -ne 0) { throw 'Startup check compilation failed' }
if ($RecoveryOnly) { & $startupExe --recovery-only (Join-Path $startupReport 'fixtures') }
else { & $startupExe (Join-Path $startupReport 'fixtures') (Join-Path $startupRoot 'desktop\setup-payload.zip') }
if ($LASTEXITCODE -ne 0) { throw 'Startup checks failed' }
