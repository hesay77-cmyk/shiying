param([switch]$Public,[string]$PeerTorrent)
$ErrorActionPreference='Stop'
$dhtRoot=Split-Path -Parent $PSScriptRoot
$dhtKind=if($PeerTorrent){'dht-peer-public-'}elseif($Public){'dht-bootstrap-public-'}else{'dht-bootstrap-local-'}
$dhtReport=Join-Path $dhtRoot ('reports\'+$dhtKind+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $dhtReport | Out-Null
$dhtCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$dhtRefs=@('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
$dhtSources=@('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs')|ForEach-Object{Join-Path $dhtRoot ('desktop\'+$_)}
$dhtExe=Join-Path $dhtReport 'Dht.Bootstrap.Check.exe'
& $dhtCompiler /nologo /target:exe /platform:x64 /utf8output @dhtRefs /main:DhtBootstrapCheck ('/out:'+$dhtExe) @dhtSources (Join-Path $PSScriptRoot 'dht-bootstrap-check.cs')
if($LASTEXITCODE -ne 0){throw 'Bootstrap check compilation failed'}
if($PeerTorrent){& $dhtExe $dhtReport public-peers ([IO.Path]::GetFullPath($PeerTorrent))}elseif($Public){
 New-Item -ItemType Directory -Path (Join-Path $dhtReport 'bin') | Out-Null
 Copy-Item -LiteralPath (Join-Path $dhtRoot 'desktop\bin\aria2c.exe') -Destination (Join-Path $dhtReport 'bin\aria2c.exe')
 Copy-Item -LiteralPath (Join-Path $dhtRoot 'desktop\components.json') -Destination (Join-Path $dhtReport 'components.json')
 & $dhtExe $dhtReport public
}else{& $dhtExe $dhtReport}
if($LASTEXITCODE -ne 0){throw 'Bootstrap checks failed'}
