[CmdletBinding()]
param(
  [switch]$SkipWebBuild,
  [switch]$SkipReleaseBuild
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

go test ./...
npm test --prefix web

if (-not $SkipWebBuild) {
  npm run build --prefix web
}

if (-not $SkipReleaseBuild) {
  New-Item -ItemType Directory -Force -Path (Join-Path $root 'tmp') | Out-Null
  go build -buildvcs=false -tags with_embed -o tmp\museforge-check.exe ./cmd/server
}

Write-Host 'MuseForge checks passed.'
