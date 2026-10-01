<#
.SYNOPSIS
  OpenVoice Edge release script. Run it with no arguments to see this help.
  Checks -> commit -> push -> watch GitHub checks. Nothing reaches Cloudflare Workers unless you pass -Deploy.

.EXAMPLE
  ./scripts/release.ps1                                        # show help
  ./scripts/release.ps1 -Message "Fix search"                  # commit + push, GitHub runs checks only
  ./scripts/release.ps1 -Message "Fix search" -Deploy          # ... and deploy to Workers
  ./scripts/release.ps1 -Deploy                                # deploy what is already on main
  ./scripts/release.ps1 -Push                                  # push commits you already made
  ./scripts/release.ps1 -DryRun                                # try everything, change nothing
#>
[CmdletBinding()]
param(
  [string]$Message,
  [string]$Url = 'https://openvoice-edge.hicms.workers.dev',
  [string]$Branch = 'main',
  [switch]$Push,
  [switch]$Deploy,
  [switch]$SkipChecks,
  [switch]$DryRun,
  [Alias('h', '?')][switch]$Help
)

function Show-Help {
  Write-Host @"

OpenVoice Edge 发版脚本

用法：
  ./scripts/release.ps1 [参数]

不带任何参数只显示本帮助，不会执行任何操作。

参数：
  -Message "说明"   提交所有改动（说明即提交信息）、推送，并等待 GitHub 检查结果。
                    不会部署到 Cloudflare Workers。
  -Push             只推送已经提交好的内容（不新建提交），并等待检查结果。
  -Deploy           部署到 Cloudflare Workers，部署后检查线上站点。
                    可与 -Message 一起用：先提交推送，再部署。
  -Url <地址>       部署后检查的站点，默认 https://openvoice-edge.hicms.workers.dev
  -SkipChecks       跳过本地的类型检查、lint、测试和构建。
  -DryRun           只演练：跑检查并显示将要做什么，不提交、不推送、不部署。
  -Branch <分支>    发版分支，默认 main。
  -Help, -h, -?     显示本帮助。

示例：
  ./scripts/release.ps1 -Message "修复声音搜索"             只提交并推送
  ./scripts/release.ps1 -Message "修复声音搜索" -Deploy     提交、推送并部署
  ./scripts/release.ps1 -Deploy                             部署 main 上现有的版本
  ./scripts/release.ps1 -DryRun                             演练

说明：
  需要 git、node、npm 和 GitHub CLI（先运行 gh auth login）。
  提交前会扫描改动里是否有 API Key 或 .dev.vars 中的值，发现就拒绝提交。
  部署后会调用 /api/health。如果设置了环境变量 OVE_TOKEN（一把访问密钥），
  还会运行完整的 smoke 测试。

"@
}

if ($Help -or $PSBoundParameters.Count -eq 0) {
  Show-Help
  exit 0
}
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

if ($dirty.Count -eq 0 -and $ahead -eq 0 -and -not $Deploy) {
  Write-Host "`nNothing to release: no local changes and nothing unpushed. Use -Deploy to redeploy what is on $Branch." -ForegroundColor Yellow
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
  $target = if ($Deploy) { 'and then deploy to Workers' } else { 'without deploying to Workers' }
  Write-Host "`nDry run finished. Would commit $($dirty.Count) changed file(s) and push $($ahead) existing commit(s) to origin/$Branch, $target." -ForegroundColor Yellow
  exit 0
}

if ($dirty.Count -gt 0) {
  Run 'Commit' { git add -A; git commit -q -m $Message }
}

if ($dirty.Count -gt 0 -or $ahead -gt 0) { Run 'Push' { git push origin $Branch } }
$sha = (Capture { git rev-parse HEAD }).Trim()

function Find-Run([string]$Event, [datetime]$Since) {
  for ($i = 0; $i -lt 30; $i++) {
    $runs = Capture { gh run list --workflow 'CI and deploy' --commit $sha --event $Event --json databaseId,createdAt --limit 5 } | ConvertFrom-Json
    $match = @($runs).Where({ [datetime]$_.createdAt -ge $Since }) | Select-Object -First 1
    if ($match) { return $match.databaseId }
    Start-Sleep -Seconds 2
  }
  Fail 'The workflow run did not start within a minute. Check the Actions tab on GitHub.'
}

function Watch-Run([long]$RunId) {
  $runUrl = (Capture { gh run view $RunId --json url --jq .url }).Trim()
  Write-Host "Run: $runUrl"
  gh run watch $RunId --exit-status --interval 5
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`nThe run failed. Failed steps:" -ForegroundColor Red
    gh run view $RunId --log-failed 2>&1 | Select-Object -Last 40
    Fail "Release failed. Details: $runUrl"
  }
}

if (-not $Deploy) {
  Step 'Waiting for the GitHub checks (no deploy)'
  # A push run exists only when something new was pushed; the 5 minute window covers clock skew.
  if ($dirty.Count -gt 0 -or $ahead -gt 0) {
    Watch-Run (Find-Run 'push' ([datetime]::UtcNow.AddMinutes(-5)))
  }
  Write-Host "`nPushed $($sha.Substring(0, 7)). Checks passed. Not deployed to Workers (add -Deploy to deploy)." -ForegroundColor Green
  exit 0
}

Step 'Starting the deploy workflow'
$started = [datetime]::UtcNow.AddSeconds(-10)
Run 'Trigger workflow' { gh workflow run 'CI and deploy' --ref $Branch }
$runId = Find-Run 'workflow_dispatch' $started
Write-Host 'If the deploy job asks for approval, open the link below and press Approve.' -ForegroundColor Yellow
Watch-Run $runId

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

Write-Host "`nDeployed $($sha.Substring(0, 7)) to Cloudflare Workers." -ForegroundColor Green