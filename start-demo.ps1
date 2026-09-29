$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$launcher = Join-Path $repoRoot 'scripts/start-demo.mjs'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'Node.js 24 or newer is required. Install Node.js, then run .\start-demo.ps1 again.'
    exit 1
}

Push-Location $repoRoot
try {
    & node $launcher
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
