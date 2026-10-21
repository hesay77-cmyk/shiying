$ErrorActionPreference = 'Stop'
$setupRoot = $PSScriptRoot
$setupCompiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$setupReferences = @('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
$setupSources = @('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs','Setup.cs') | ForEach-Object { Join-Path $setupRoot $_ }
if (-not (Test-Path -LiteralPath (Join-Path $setupRoot 'setup-payload.zip'))) { throw 'Run build.ps1 and scripts/setup-payload.py first' }
& $setupCompiler /nologo /target:winexe /platform:x64 /optimize+ /utf8output ('/win32manifest:'+(Join-Path $setupRoot 'app.manifest')) @setupReferences /main:ShiyingDesktop.SetupProgram ('/win32icon:'+(Join-Path $setupRoot 'shiying.ico')) ('/resource:'+(Join-Path $setupRoot 'setup-payload.zip')+',ShiyingPayload') ('/out:'+(Join-Path $setupRoot 'ShiyingSetup.exe')) @setupSources
if ($LASTEXITCODE -ne 0) { throw 'Setup compilation failed' }
