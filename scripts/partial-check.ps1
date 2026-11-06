$ErrorActionPreference='Stop'
$partialRoot=Split-Path -Parent $PSScriptRoot
$partialReport=Join-Path $partialRoot ('reports\partial-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $partialReport | Out-Null
$partialResolved=[IO.Path]::GetFullPath($partialReport)
if(-not $partialResolved.StartsWith(([IO.Path]::GetFullPath((Join-Path $partialRoot 'reports'))+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected fixture root'}
$partialCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$partialRefs=@('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
$partialSources=@('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs')|ForEach-Object{Join-Path $partialRoot ('desktop\'+$_)}
$partialExe=Join-Path $partialReport 'Partial.Check.exe'
& $partialCompiler /nologo /target:exe /platform:x64 /utf8output @partialRefs /main:PartialCheck ('/out:'+$partialExe) @partialSources (Join-Path $PSScriptRoot 'partial-check.cs')
if($LASTEXITCODE -ne 0){throw 'Partial check compilation failed'}
# The real download engine sits next to the check, where the desktop app looks for it.
New-Item -ItemType Directory -Path (Join-Path $partialReport 'bin') | Out-Null
Copy-Item -LiteralPath (Join-Path $partialRoot 'desktop\bin\aria2c.exe') -Destination (Join-Path $partialReport 'bin\aria2c.exe')
Copy-Item -LiteralPath (Join-Path $partialRoot 'desktop\components.json') -Destination (Join-Path $partialReport 'components.json')
& $partialExe $partialReport
if($LASTEXITCODE -ne 0){throw 'Partial checks failed'}
