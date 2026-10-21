$ErrorActionPreference = 'Stop'
$quietRoot = Split-Path -Parent $PSScriptRoot
$quietReport = Join-Path $quietRoot ('reports\quiet-desktop-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $quietReport | Out-Null
$quietCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$quietReferences = @('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
$quietExe = Join-Path $quietReport 'Quiet.Check.exe'
$quietSources = @('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs','Setup.cs') | ForEach-Object { Join-Path $quietRoot ('desktop\' + $_) }
& $quietCompiler /nologo /target:exe /platform:x64 /utf8output @quietReferences ('/win32icon:' + (Join-Path $quietRoot 'desktop\shiying.ico')) /main:QuietDesktopCheck ('/out:' + $quietExe) @quietSources (Join-Path $PSScriptRoot 'quiet-desktop-check.cs')
if ($LASTEXITCODE -ne 0) { throw 'Quiet desktop check compilation failed' }
& $quietExe (Join-Path $quietReport 'fixtures')
if ($LASTEXITCODE -ne 0) { throw ('Quiet desktop checks failed: ' + $LASTEXITCODE) }
