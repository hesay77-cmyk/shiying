$ErrorActionPreference = 'Stop'
$reviewRoot = Split-Path -Parent $PSScriptRoot
$reviewReport = Join-Path $reviewRoot ('reports\management-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $reviewReport | Out-Null
$reviewCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$reviewReferences = @('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
$reviewExe = Join-Path $reviewReport 'Management.Check.exe'
& $reviewCompiler /nologo /target:exe /platform:x64 /utf8output @reviewReferences /main:ManagementCheck ('/out:' + $reviewExe) (Join-Path $reviewRoot 'desktop\Shiying.cs') (Join-Path $reviewRoot 'desktop\Window.cs') (Join-Path $reviewRoot 'desktop\Plugin.cs') (Join-Path $reviewRoot 'desktop\Components.cs') (Join-Path $reviewRoot 'desktop\Install.cs') (Join-Path $reviewRoot 'desktop\Details.cs') (Join-Path $reviewRoot 'desktop\Torrent.cs') (Join-Path $reviewRoot 'desktop\Netdisk.cs') (Join-Path $PSScriptRoot 'management-check.cs')
if ($LASTEXITCODE -ne 0) { throw 'Management check compilation failed' }
& $reviewExe (Join-Path $reviewReport 'fixtures')
if ($LASTEXITCODE -ne 0) { throw 'Management checks failed' }
