<#
.SYNOPSIS
  One-command release: local checks -> commit -> push -> watch the GitHub Actions deploy.

.EXAMPLE
  ./scripts/release.ps1 -Message "Fix voice picker search"
  ./scripts/release.ps1 -Message "Tweak limits" -Url https://openvoice-edge.your-name.workers.dev
  ./scripts/release.ps1 -DryRun        # run the checks and show what would happen, change nothing

.NOTES
  Needs git, node and the GitHub CLI (gh auth login). The deploy job may wait for your approval
  on the Actions page when the `production` Environment has required reviewers.
  With -Url the script also checks /api/health after the deploy, and runs the full smoke test
  when the OVE_TOKEN environment variable holds an access key.
#>
[CmdletBinding()]
param(
  [string]$Message,
  [string]$Url,
  [string]$Branch = 'main',
  [switch]$SkipChecks,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

function Step([string]$Text) { Write-Host "`n==> $Text" -ForegroundColor Cyan }
function Fail([string]$Text) { Write-Host "ERROR: $Text" -ForegroundColor Red; exit 1 }

function Run([string]$Label, [scriptblock]$Command) {
  Step $Label
  & $Command
  if ($LASTEXITCODE -ne 0) { Fail "$Label failed (exit code $LASTEXITCODE)." }
}

function Capture([scriptblock]$Command) {
  $output = & $Command
  if ($LASTEXITCODE -ne 0) { Fail "A git/gh command failed (exit code $LASTEXITCODE)." }
  return $output
}

foreach ($tool in 'git', 'node', 'npm', 'gh') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Fail "$tool is not installed or not on PATH." }
}
gh auth status *> $null
if ($LASTEXITCODE -ne 0) { Fail 'GitHub CLI is not signed in. Run: gh auth login' }

$current = (Capture { git rev-parse --abbrev-ref HEAD }).Trim()
if ($current -ne $Branch) { Fail "You are on '$current'. Releases go from '$Branch'. Switch with: git switch $Branch" }

Step 'Syncing with GitHub'
Run 'git fetch' { git fetch origin $Branch }
$behind = [int](Capture { git rev-list --count "HEAD..origin/$Branch" })
if ($behind -gt 0) {
  Write-Host "Local branch is $behind commit(s) behind origin/$Branch (for example a merged Dependabot PR)."
  if ($DryRun) { Fail 'Pull first: git pull --rebase --autostash' }
  Run 'git pull --rebase --autostash' { git pull --rebase --autostash origin $Branch }
}

if (-not $SkipChecks) {
  if (-not (Test-Path node_modules)) { Run 'npm ci' { npm ci } }
  Run 'Typecheck' { npm run typecheck }
  Run 'Lint' { npm run lint }
  Run 'File size check' { npm run check:size }
  Run 'Tests' { npm test }
  Run 'Build' { npm run build }
}

$dirty = @(Capture { git status --porcelain }).Where({ $_ })
$ahead = [int](Capture { git rev-list --count "origin/$Branch..HEAD" })

if ($dirty.Count -eq 0 -and $ahead -eq 0) {
  Write-Host "`nNothing to release: no local changes and nothing unpushed." -ForegroundColor Yellow
  exit 0
}

if ($dirty.Count -gt 0) {
  if (-not $Message -and -not $DryRun) { Fail 'There are uncommitted changes. Pass a commit message: -Message "what changed"' }

  Step 'Scanning changes for secrets'
  $secretValues = @()
  if (Test-Path .dev.vars) {
    $secretValues = Get-Content .dev.vars |
      Where-Object { $_ -match '^[A-Z_]+=.{9,}$' } |
      ForEach-Object { ($_ -split '=', 2)[1].Trim() }
  }
  git add -A
  $added = (Capture { git diff --cached -U0 }) -join "`n"
  $leaks = @()
  if ($added -match 'sk-[A-Za-z0-9]{20,}') { $leaks += 'something that looks like an API key (sk-...)' }
  if ($added -match '(?m)^\+\+\+ b/\.dev\.vars') { $leaks += '.dev.vars' }
  foreach ($value in $secretValues) { if ($added.Contains($value)) { $leaks += 'a value copied from .dev.vars' } }
  if ($leaks.Count -gt 0) {
    git reset -q
    Fail ("Refusing to commit: found " + ($leaks -join ', ') + '. Nothing was committed.')
  }
  git reset -q
  Write-Host 'No secrets found.'
}

if ($DryRun) {
  Write-Host "`nDry run finished. Would commit $($dirty.Count) changed file(s) and push $($ahead) existing commit(s) to origin/$Branch." -ForegroundColor Yellow
  exit 0
}

if ($dirty.Count -gt 0) {
  Run 'Commit' { git add -A; git commit -q -m $Message }
}

Run 'Push' { git push origin $Branch }
$sha = (Capture { git rev-parse HEAD }).Trim()

Step 'Waiting for the GitHub Actions run'
$runId = $null
for ($i = 0; $i -lt 30 -and -not $runId; $i++) {
  $runs = Capture { gh run list --commit $sha --json databaseId,workflowName --limit 5 } | ConvertFrom-Json
  $match = @($runs).Where({ $_.workflowName -eq 'CI and deploy' }) | Select-Object -First 1
  if ($match) { $runId = $match.databaseId } else { Start-Sleep -Seconds 2 }
}
if (-not $runId) { Fail 'The workflow run did not start within a minute. Check the Actions tab on GitHub.' }

$runUrl = (Capture { gh run view $runId --json url --jq .url }).Trim()
Write-Host "Run: $runUrl"
Write-Host 'If the deploy job asks for approval, open the link above and press Approve.' -ForegroundColor Yellow

gh run watch $runId --exit-status --interval 5
if ($LASTEXITCODE -ne 0) {
  Write-Host "`nThe run failed. Failed steps:" -ForegroundColor Red
  gh run view $runId --log-failed 2>&1 | Select-Object -Last 40
  Fail "Release failed. Details: $runUrl"
}

if ($Url) {
  $Url = $Url.TrimEnd('/')
  Step "Checking $Url"
  try {
    $health = Invoke-RestMethod -Uri "$Url/api/health" -TimeoutSec 20
    if (-not $health.ok) { Fail 'Health endpoint answered but did not report ok.' }
    Write-Host 'Health check passed.' -ForegroundColor Green
  } catch {
    Fail "Health check failed: $($_.Exception.Message)"
  }
  if ($env:OVE_TOKEN) {
    Run 'Smoke test' { node scripts/smoke.ts $Url }
  } else {
    Write-Host 'Set OVE_TOKEN to an access key to also run the full smoke test.'
  }
}

Write-Host "`nReleased $($sha.Substring(0, 7)) to Cloudflare." -ForegroundColor Green
