$ErrorActionPreference='Stop'
$pluginRoot=Split-Path -Parent $PSScriptRoot
$pluginReport=Join-Path $pluginRoot ('reports\plugin-native-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $pluginReport | Out-Null
$pluginCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$pluginRefs=@('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
$pluginSources=@('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs')|ForEach-Object{Join-Path $pluginRoot ('desktop\'+$_)}
$pluginExe=Join-Path $pluginReport 'Plugin.Check.exe'
& $pluginCompiler /nologo /target:exe /platform:x64 /utf8output ('/win32manifest:'+(Join-Path $pluginRoot 'desktop\app.manifest')) @pluginRefs /main:PluginNativeCheck ('/out:'+$pluginExe) @pluginSources (Join-Path $PSScriptRoot 'plugin-native-check.cs')
if($LASTEXITCODE -ne 0){throw 'Embedded interface check compilation failed'}
& $pluginExe $pluginReport (Join-Path $pluginRoot 'desktop\Shiying.Interface.dll')
if($LASTEXITCODE -ne 0){throw 'Embedded interface checks failed'}
