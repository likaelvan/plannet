$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$venvPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) {
    $pythonCandidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs/Python/Python313/python.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs/Python/Python312/python.exe'),
        (Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')
    )
    $basePython = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($basePython) { & $basePython -m venv .venv }
    elseif (Get-Command py -ErrorAction SilentlyContinue) { py -3 -m venv .venv }
    else { python -m venv .venv }
    if ($LASTEXITCODE -ne 0) { throw 'Could not create .venv. Install Python 3.10 or newer and retry.' }
}
& $venvPython server.py --open
if ($LASTEXITCODE -ne 0) { Read-Host 'Plannet stopped. Press Enter to close' }
