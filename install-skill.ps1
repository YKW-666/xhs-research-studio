param([string]$CodexHome = $(if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }))
$ErrorActionPreference = 'Stop'
$destination = Join-Path $CodexHome 'skills/xhs-research-studio'
if (Test-Path -LiteralPath $destination) { throw "Skill already exists: $destination. Review it before replacing." }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$repoPath = $PSScriptRoot.Replace('\','/').Replace("'","''")
$content = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'SKILL.md') -Raw -Encoding UTF8).Replace('{{REPO}}',$repoPath)
[IO.File]::WriteAllText((Join-Path $destination 'SKILL.md'),$content,(New-Object Text.UTF8Encoding($false)))
Write-Host "Installed skill: $destination. Available in the next Codex turn."
