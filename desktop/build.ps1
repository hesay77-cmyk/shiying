$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$references = @('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
& (Join-Path $taskRoot 'build-interface.ps1')
$sources = @('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs') | ForEach-Object { Join-Path $taskRoot $_ }
$iconPath = Join-Path $taskRoot 'shiying.ico'
$iconBytes = [IO.File]::ReadAllBytes((Join-Path $taskRoot '..\img\icon128.png'))
$iconStream = [IO.File]::Create($iconPath)
$iconWriter = [IO.BinaryWriter]::new($iconStream)
try {
    $iconWriter.Write([int16]0); $iconWriter.Write([int16]1); $iconWriter.Write([int16]1)
    $iconWriter.Write([byte]128); $iconWriter.Write([byte]128); $iconWriter.Write([byte]0); $iconWriter.Write([byte]0)
    $iconWriter.Write([int16]1); $iconWriter.Write([int16]32); $iconWriter.Write([int]$iconBytes.Length); $iconWriter.Write([int]22); $iconWriter.Write($iconBytes)
} finally { $iconWriter.Dispose(); $iconStream.Dispose() }
$desktopName = 'Ruxget.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /utf8output ('/win32manifest:'+(Join-Path $taskRoot 'app.manifest')) @references ('/win32icon:'+$iconPath) ('/out:' + (Join-Path $taskRoot $desktopName)) @sources
if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
& $compiler /nologo /target:exe /platform:x64 /optimize+ /utf8output ('/win32manifest:'+(Join-Path $taskRoot 'app.manifest')) @references ('/win32icon:'+$iconPath) ('/out:' + (Join-Path $taskRoot 'Shiying.Check.exe')) @sources
if ($LASTEXITCODE -ne 0) { throw 'Check build failed' }
& (Join-Path $taskRoot 'Shiying.Check.exe') --selftest
if ($LASTEXITCODE -ne 0) { throw 'Desktop checks failed' }
