param(
  [string]$Image = "postgres:16-alpine",
  [string]$ContainerName = "museforge-postgres-verify",
  [int]$Port = 55432
)

$ErrorActionPreference = "Stop"

function Wait-ForPostgres {
  param([string]$Container)

  for ($i = 0; $i -lt 45; $i++) {
    docker exec $Container pg_isready -U museforge -d museforge_test | Out-Null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 1
  }

  throw "PostgreSQL did not become ready in time."
}

$existing = docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $ContainerName }
if ($existing) {
  docker rm -f $ContainerName 2>$null | Out-Null
}

try {
  docker run --rm -d `
    --name $ContainerName `
    -e POSTGRES_USER=museforge `
    -e POSTGRES_PASSWORD=museforge `
    -e POSTGRES_DB=museforge_test `
    -p "${Port}:5432" `
    $Image | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to start PostgreSQL Docker container with image $Image."
  }

  Wait-ForPostgres -Container $ContainerName

  $env:MUSEFORGE_TEST_DATABASE_URL = "postgres://museforge:museforge@127.0.0.1:${Port}/museforge_test?sslmode=disable"
  go test ./internal/db -run TestPostgresIntegrationMigrationsAndRepositories -count=1 -v
}
finally {
  Remove-Item Env:\MUSEFORGE_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  docker rm -f $ContainerName 2>$null | Out-Null
}
