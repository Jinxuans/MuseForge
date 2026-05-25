[CmdletBinding()]
param(
  [string]$Output = 'museforge.exe',
  [switch]$SkipWebBuild
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

if (-not $SkipWebBuild) {
  npm run build --prefix web
}

go build -buildvcs=false -tags with_embed -o $Output ./cmd/server
Write-Host "Built $Output"
