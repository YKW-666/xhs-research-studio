param([switch]$Video, [switch]$Transcribe, [string]$Python = 'python', [string]$Npm = 'npm')
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 20+ (including npm), then reopen PowerShell.' }
    & $Npm ci --ignore-scripts --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { throw 'Node dependency installation failed.' }
    if ($Video) { Write-Host 'Video frames are now included in basic setup. Use -Transcribe only if you want the optional 1.6 GB local speech model.' }
    if ($Transcribe) {
        & $Python -c "import sys; assert sys.version_info[:2] == (3,12), 'Python 3.12 required for this preview'"
        if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.12 or pass -Python with its executable path.' }
        & $Python -m venv .venv
        if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed.' }
        & ./.venv/Scripts/python.exe -m pip install --only-binary=:all: -r requirements-video.lock.txt
        if ($LASTEXITCODE -ne 0) { throw 'Video dependency installation failed.' }
        & ./.venv/Scripts/python.exe scripts/prepare-model.py
        if ($LASTEXITCODE -ne 0) { throw 'Model preparation failed. Re-run setup to resume verified files.' }
    }
    if (-not $Transcribe) { Write-Host 'Light mode ready: text, comments and browser video frames. No Python environment or speech model installed.' }
    Write-Host 'Ready. Run: node scripts/reader.mjs login'
} finally { Pop-Location }
