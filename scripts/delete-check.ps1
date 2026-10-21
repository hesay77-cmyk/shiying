$ErrorActionPreference='Stop'
$deleteRoot=Split-Path -Parent $PSScriptRoot
$deleteReport=Join-Path $deleteRoot ('reports\delete-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $deleteReport | Out-Null
$deleteResolved=[IO.Path]::GetFullPath($deleteReport)
if(-not $deleteResolved.StartsWith(([IO.Path]::GetFullPath((Join-Path $deleteRoot 'reports'))+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected fixture root'}
$deleteTarget=Join-Path $deleteReport 'junction-target'
New-Item -ItemType Directory -Path $deleteTarget | Out-Null
[IO.File]::WriteAllText((Join-Path $deleteTarget 'sentinel.bin'),'preserve junction target')
New-Item -ItemType Junction -Path (Join-Path $deleteReport 'junction') -Target $deleteTarget | Out-Null
$deleteCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$deleteRefs=@('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
$deleteSources=@('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs')|ForEach-Object{Join-Path $deleteRoot ('desktop\'+$_)}
$deleteExe=Join-Path $deleteReport 'Delete.Check.exe'
& $deleteCompiler /nologo /target:exe /platform:x64 /utf8output @deleteRefs /main:DeleteCheck ('/out:'+$deleteExe) @deleteSources (Join-Path $PSScriptRoot 'delete-check.cs')
if($LASTEXITCODE -ne 0){throw 'Delete check compilation failed'}
& $deleteExe $deleteReport
if($LASTEXITCODE -ne 0){throw 'Delete checks failed'}
