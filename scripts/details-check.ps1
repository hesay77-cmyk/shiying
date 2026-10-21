param([switch]$Headless)
$ErrorActionPreference = 'Stop'
$detailRoot = Split-Path -Parent $PSScriptRoot
$detailReport = Join-Path $detailRoot ('reports\details-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $detailReport | Out-Null
$detailCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$detailReferences = @('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
$detailSources = @('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs') | ForEach-Object { Join-Path $detailRoot ('desktop\' + $_) }
$detailExe = Join-Path $detailRoot 'desktop\Details.Check.exe'
& $detailCompiler /nologo /target:exe /platform:x64 /utf8output @detailReferences /main:DetailsCheck ('/out:' + $detailExe) @detailSources (Join-Path $PSScriptRoot 'details-check.cs')
if ($LASTEXITCODE -ne 0) { throw 'Detail check compilation failed' }
if ($Headless) { & $detailExe $detailReport --headless }
else { & $detailExe $detailReport }
if ($LASTEXITCODE -ne 0) { throw 'Detail checks failed' }
