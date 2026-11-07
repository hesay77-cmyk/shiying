$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$references = @('/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:Microsoft.CSharp.dll')
& (Join-Path $taskRoot 'build-interface.ps1')
$sources = @('Shiying.cs','Window.cs','Plugin.cs','Components.cs','Install.cs','Details.cs','Torrent.cs','Netdisk.cs') | ForEach-Object { Join-Path $taskRoot $_ }
$iconPath = Join-Path $taskRoot 'shiying.ico'
# Program icon with every size the extension ships (16 px is hand-drawn), so the taskbar, tray and title bar
# never show a blurry downscale of the 128 px picture. Entries are 32-bit DIBs (not PNG): System.Drawing.Icon,
# which the window and tray use, misreads PNG entries.
Add-Type -AssemblyName System.Drawing
$iconSizes = @(16, 32, 48, 64, 128)
$iconFiles = @{16 = 'icon16.png'; 32 = 'icon32.png'; 48 = 'icon48.png'; 64 = 'icon.png'; 128 = 'icon128.png'}
$iconImages = @($iconSizes | ForEach-Object {
    $side = $_; $bitmap = [Drawing.Bitmap]::new((Join-Path $taskRoot ('..\img\' + $iconFiles[$side])))
    try {
        $buffer = [IO.MemoryStream]::new(); $dib = [IO.BinaryWriter]::new($buffer)
        $maskRow = [int]([Math]::Ceiling($side / 32.0) * 4)
        $dib.Write([int]40); $dib.Write([int]$side); $dib.Write([int]($side * 2)); $dib.Write([int16]1); $dib.Write([int16]32)
        $dib.Write([int]0); $dib.Write([int]($side * $side * 4 + $maskRow * $side)); $dib.Write([int]0); $dib.Write([int]0); $dib.Write([int]0); $dib.Write([int]0)
        for ($y = $side - 1; $y -ge 0; $y--) { for ($x = 0; $x -lt $side; $x++) { $c = $bitmap.GetPixel($x, $y); $dib.Write([byte]$c.B); $dib.Write([byte]$c.G); $dib.Write([byte]$c.R); $dib.Write([byte]$c.A) } }
        $dib.Write([byte[]]::new($maskRow * $side)); $dib.Flush()
        ,$buffer.ToArray()
    } finally { $bitmap.Dispose() }
})
$iconStream = [IO.File]::Create($iconPath)
$iconWriter = [IO.BinaryWriter]::new($iconStream)
try {
    $iconWriter.Write([int16]0); $iconWriter.Write([int16]1); $iconWriter.Write([int16]$iconSizes.Count)
    $iconOffset = 6 + 16 * $iconSizes.Count
    for ($n = 0; $n -lt $iconSizes.Count; $n++) {
        $side = $iconSizes[$n]; $bytes = $iconImages[$n]
        $iconWriter.Write([byte]$side); $iconWriter.Write([byte]$side); $iconWriter.Write([byte]0); $iconWriter.Write([byte]0)
        $iconWriter.Write([int16]1); $iconWriter.Write([int16]32); $iconWriter.Write([int]$bytes.Length); $iconWriter.Write([int]$iconOffset)
        $iconOffset += $bytes.Length
    }
    foreach ($bytes in $iconImages) { $iconWriter.Write($bytes) }
} finally { $iconWriter.Dispose(); $iconStream.Dispose() }
$desktopName = 'Ruxget.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /utf8output ('/win32manifest:'+(Join-Path $taskRoot 'app.manifest')) @references ('/win32icon:'+$iconPath) ('/resource:'+$iconPath+',Ruxget.ico') ('/out:' + (Join-Path $taskRoot $desktopName)) @sources
if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
& $compiler /nologo /target:exe /platform:x64 /optimize+ /utf8output ('/win32manifest:'+(Join-Path $taskRoot 'app.manifest')) @references ('/win32icon:'+$iconPath) ('/resource:'+$iconPath+',Ruxget.ico') ('/out:' + (Join-Path $taskRoot 'Shiying.Check.exe')) @sources
if ($LASTEXITCODE -ne 0) { throw 'Check build failed' }
& (Join-Path $taskRoot 'Shiying.Check.exe') --selftest
if ($LASTEXITCODE -ne 0) { throw 'Desktop checks failed' }
