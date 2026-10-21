$ErrorActionPreference='Stop'
$takeoverRoot=Split-Path -Parent $PSScriptRoot
$takeoverReport=Join-Path $takeoverRoot ('reports\takeover-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $takeoverReport | Out-Null
$takeoverResolved=[IO.Path]::GetFullPath($takeoverReport)
if(-not $takeoverResolved.StartsWith(([IO.Path]::GetFullPath((Join-Path $takeoverRoot 'reports'))+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected fixture root'}
$takeoverCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$takeoverRefs=@('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
$takeoverSources=@('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs')|ForEach-Object{Join-Path $takeoverRoot ('desktop\'+$_)}
$takeoverExe=Join-Path $takeoverReport 'Takeover.Check.exe'
& $takeoverCompiler /nologo /target:exe /platform:x64 /utf8output @takeoverRefs /main:TakeoverCheck ('/out:'+$takeoverExe) @takeoverSources (Join-Path $PSScriptRoot 'takeover-check.cs')
if($LASTEXITCODE -ne 0){throw 'Takeover check compilation failed'}
& $takeoverExe $takeoverReport
if($LASTEXITCODE -ne 0){throw 'Takeover checks failed'}
