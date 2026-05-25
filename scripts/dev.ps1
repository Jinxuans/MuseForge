[CmdletBinding()]
param(
  [string]$Addr = $env:ADDR,
  [int]$FrontendPort = 5171
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

if ([string]::IsNullOrWhiteSpace($Addr)) {
  $Addr = ':5000'
}

function Get-BackendUrl([string]$Value) {
  if ($Value.StartsWith(':')) {
    return "http://127.0.0.1$Value"
  }
  if ($Value -match '^https?://') {
    return $Value
  }
  return "http://$Value"
}

function Stop-ChildProcess($Process, [string]$Name) {
  if ($null -eq $Process -or $Process.HasExited) {
    return
  }
  Write-Host "Stopping $Name..."
  Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
}

$tmp = Join-Path $root 'tmp'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$backendOut = Join-Path $tmp 'backend-dev.log'
$backendErr = Join-Path $tmp 'backend-dev.err.log'
$frontendOut = Join-Path $tmp 'frontend-dev.log'
$frontendErr = Join-Path $tmp 'frontend-dev.err.log'

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCommand) {
  $npm = $npmCommand.Source
} else {
  $npm = (Get-Command npm -ErrorAction Stop).Source
}

$env:ADDR = $Addr
$env:VITE_BACKEND_URL = Get-BackendUrl $Addr

Write-Host "Starting MuseForge backend at $($env:VITE_BACKEND_URL)"
$backend = Start-Process -FilePath 'go' `
  -ArgumentList @('run', './cmd/server') `
  -WorkingDirectory $root `
  -RedirectStandardOutput $backendOut `
  -RedirectStandardError $backendErr `
  -WindowStyle Hidden `
  -PassThru

Write-Host "Starting Vite frontend at http://127.0.0.1:$FrontendPort"
$frontend = Start-Process -FilePath $npm `
  -ArgumentList @('run', 'dev', '--prefix', 'web', '--', '--host', '127.0.0.1', '--port', "$FrontendPort") `
  -WorkingDirectory $root `
  -RedirectStandardOutput $frontendOut `
  -RedirectStandardError $frontendErr `
  -WindowStyle Hidden `
  -PassThru

Write-Host ''
Write-Host 'Logs:'
Write-Host "  Backend:  $backendOut"
Write-Host "  Frontend: $frontendOut"
Write-Host ''
Write-Host 'Press Ctrl+C to stop both processes.'

try {
  while ($true) {
    Start-Sleep -Seconds 1
    if ($backend.HasExited) {
      throw "Backend process exited with code $($backend.ExitCode). See $backendErr"
    }
    if ($frontend.HasExited) {
      throw "Frontend process exited with code $($frontend.ExitCode). See $frontendErr"
    }
  }
}
finally {
  Stop-ChildProcess $frontend 'frontend'
  Stop-ChildProcess $backend 'backend'
}
