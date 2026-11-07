$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$report=Join-Path $root ('reports\structure-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $report | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$refs=@('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
$sources=@('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs')|ForEach-Object{Join-Path $root ('desktop\'+$_)}
$exe=Join-Path $report 'Structure.Check.exe'
& $compiler /nologo /target:exe /platform:x64 /utf8output @refs /main:StructureCheck ('/out:'+$exe) @sources (Join-Path $PSScriptRoot 'structure-check.cs')
if($LASTEXITCODE -ne 0){throw 'Structure check compilation failed'}
# The engine is found next to the program: run from a copy of desktop\bin beside the check.
Copy-Item -Recurse (Join-Path $root 'desktop\bin') (Join-Path $report 'bin')
Copy-Item (Join-Path $root 'desktop\components.json') $report
& $exe $report
if($LASTEXITCODE -ne 0){throw 'Structure checks failed'}
