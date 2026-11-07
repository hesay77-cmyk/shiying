# Writes the signed update list (ruxget.json) for a release, for automatic updates of the desktop app (0.4.72+).
# Usage: powershell -File scripts\update-manifest.ps1 -Setup <Ruxget-x.y.z-Windows-Setup.exe> -Out <folder> [-Notes "…"]
# The private key stays outside the repository (E:\ai\.server-access, backed up in the private backup repository).
# Upload <folder>\ruxget.json to /update/ and the setup to /download/ on hidaydream.cloud (setup first, list last).
param(
    [Parameter(Mandatory=$true)][string]$Setup,
    [Parameter(Mandatory=$true)][string]$Out,
    [string]$Notes = '',
    [string]$Key = 'E:\ai\.server-access\ruxget-update-signing-key.xml'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$version = [regex]::Match([IO.File]::ReadAllText((Join-Path $repo 'desktop\Shiying.cs')), 'public const string Version="([^"]+)"').Groups[1].Value
$name = Split-Path -Leaf $Setup
if ($name -ne "Ruxget-$version-Windows-Setup.exe") { throw "Setup file name $name does not match version $version" }
$size = (Get-Item $Setup).Length
$sha = (Get-FileHash -Algorithm SHA256 $Setup).Hash.ToLowerInvariant()
$url = "https://hidaydream.cloud/download/$name"
$signed = "ruxget-update`n$version`n$url`n$size`n$sha"
$rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider
$rsa.PersistKeyInCsp = $false
$rsa.FromXmlString([IO.File]::ReadAllText($Key))
$signature = [Convert]::ToBase64String($rsa.SignData([Text.Encoding]::UTF8.GetBytes($signed), 'SHA256'))
# Check against the public key built into the app before writing anything.
$public = [regex]::Match([IO.File]::ReadAllText((Join-Path $repo 'desktop\Install.cs')), 'PublicKey="([^"]+)"').Groups[1].Value
$check = New-Object System.Security.Cryptography.RSACryptoServiceProvider
$check.PersistKeyInCsp = $false
$check.FromXmlString($public)
if (-not $check.VerifyData([Text.Encoding]::UTF8.GetBytes($signed), 'SHA256', [Convert]::FromBase64String($signature))) { throw 'Signature does not match the public key built into the app' }
New-Item -ItemType Directory -Force $Out | Out-Null
$manifest = [ordered]@{ version = $version; url = $url; size = $size; sha256 = $sha; signature = $signature; notes = $Notes }
[IO.File]::WriteAllText((Join-Path $Out 'ruxget.json'), ($manifest | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
"ruxget.json for $version ($size bytes, sha256 $sha)"
