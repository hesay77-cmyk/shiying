$ErrorActionPreference='Stop'
$interfaceRoot=$PSScriptRoot
$interfaceManifest=Get-Content -LiteralPath (Join-Path $interfaceRoot 'interface-dependencies.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach($interfaceFile in $interfaceManifest.files){if((Get-FileHash -LiteralPath (Join-Path $interfaceRoot $interfaceFile.name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $interfaceFile.sha256){throw ('Interface dependency hash mismatch: '+$interfaceFile.name)}}
$interfaceCompiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$interfaceRefs=@('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll',('/r:'+(Join-Path $interfaceRoot 'Microsoft.Web.WebView2.Core.dll')),('/r:'+(Join-Path $interfaceRoot 'Microsoft.Web.WebView2.WinForms.dll')))
$interfaceResources=@(('/resource:'+(Join-Path $interfaceRoot 'interface.html')+',Interface.html'),('/resource:'+(Join-Path $interfaceRoot 'interface.css')+',Interface.css'),('/resource:'+(Join-Path $interfaceRoot 'interface.js')+',Interface.js'),('/resource:'+(Join-Path $interfaceRoot '..\css\shiying.css')+',Plugin.css'),('/resource:'+(Join-Path $interfaceRoot '..\img\shiying.svg')+',Icon.svg'))
& $interfaceCompiler /nologo /target:library /platform:x64 /optimize+ /utf8output @interfaceRefs @interfaceResources ('/out:'+(Join-Path $interfaceRoot 'Shiying.Interface.dll')) (Join-Path $interfaceRoot 'PluginView.cs')
if($LASTEXITCODE -ne 0){throw 'Shared plugin interface build failed'}
