<#
    deploy.ps1  v1.2

    Builds the site and ships .output/public to ~/public_html on the Namecheap
    shared host.

    WHY TAR AND NOT SCP DIRECTLY
    "scp -r .output\public\* host:dir" silently skips dotfiles, because the
    glob is expanded by the shell and * does not match names beginning with a
    dot. That would omit .htaccess, which owns the https redirect, the
    directory-index blocking, and the SetEnv config the contact endpoint reads.
    The deploy would report success and break three things at once. Packing to
    a tarball with "tar -C dir ." includes dotfiles, uploads in one transfer,
    and unpacks with the tree intact.

    The tarball is written to $env:TEMP, never to Downloads.

    NON-DESTRUCTIVE by default: files are unpacked over the top of what is
    already there. Nothing is deleted, so hash-named assets from previous
    builds accumulate in public_html/assets over time. Pass -PruneAssets to
    empty that one directory before unpacking; it is entirely build-owned, so
    that is safe, whereas a blanket delete of public_html is not (it would
    take .well-known/acme-challenge with it).

    CONFIG - environment variables, so this file is drop-in with no edits:
      NGP_SSH_HOST    default 198.54.116.242
      NGP_SSH_USER    default ngplus
      NGP_SSH_PORT    default 21098
      NGP_REMOTE_DIR  default /home/ngplus/public_html

    USAGE
      .\deploy.ps1                 build, verify, upload
      .\deploy.ps1 -SkipBuild      upload the existing .output/public as-is
      .\deploy.ps1 -DryRun         build and verify, upload nothing
      .\deploy.ps1 -PruneAssets    clear remote assets/ before unpacking
      .\deploy.ps1 -Force          upload even if an expected file is missing

    You will be prompted for the cPanel password twice, once for scp and once
    for ssh. Installing an SSH key in ~/.ssh/authorized_keys on the server
    removes both prompts.
#>

[CmdletBinding()]
param(
    [switch] $SkipBuild,
    [switch] $DryRun,
    [switch] $PruneAssets,
    [switch] $Force
)

$ErrorActionPreference = 'Stop'

function Write-Step { param([string] $Text) Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Ok   { param([string] $Text) Write-Host "    OK   $Text" -ForegroundColor Green }
function Write-Warn { param([string] $Text) Write-Host "    WARN $Text" -ForegroundColor Yellow }
function Write-Bad  { param([string] $Text) Write-Host "    FAIL $Text" -ForegroundColor Red }

function Get-Config {
    param([string] $Name, [string] $Default)
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
    return $value.Trim()
}

# ------------------------------------------------------------------ config

$sshHost  = Get-Config 'NGP_SSH_HOST'   '198.54.116.242'
$sshUser  = Get-Config 'NGP_SSH_USER'   'ngplus'
$sshPort  = Get-Config 'NGP_SSH_PORT'   '21098'
$remote   = Get-Config 'NGP_REMOTE_DIR' '/home/ngplus/public_html'

$repoRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($repoRoot)) { $repoRoot = (Get-Location).Path }
$outDir   = Join-Path $repoRoot '.output\public'

Write-Step 'Configuration'
Write-Host "    host    $sshUser@$sshHost port $sshPort"
Write-Host "    remote  $remote"
Write-Host "    local   $outDir"

# --------------------------------------------------------------- preflight

Write-Step 'Preflight'

if (-not (Test-Path (Join-Path $repoRoot 'package.json'))) {
    Write-Bad "No package.json in $repoRoot. Run this from the repo root."
    exit 1
}
Write-Ok 'repo root looks right'

foreach ($tool in @('ssh', 'scp', 'tar')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Bad "$tool not found on PATH. Windows 10 1803+ ships all three."
        exit 1
    }
}
Write-Ok 'ssh, scp and tar available'

# ------------------------------------------------------------------- build

if ($SkipBuild) {
    Write-Step 'Build skipped (-SkipBuild)'
} else {
    Write-Step 'Building'
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Bad "npm run build exited $LASTEXITCODE"
        exit 1
    }
    Write-Ok 'build completed'
}

if (-not (Test-Path $outDir)) {
    Write-Bad "$outDir does not exist. Did the build change its output directory?"
    exit 1
}

# -------------------------------------------------------------- verify out

Write-Step 'Verifying build output'

# index.html is fatal. The rest are warnings: a missing one usually means the
# source file was never saved into the repo, which is worth seeing before an
# upload rather than discovering from a 404 afterwards.
$expected = @(
    @{ Path = 'index.html';      Fatal = $true  },
    @{ Path = '.htaccess';       Fatal = $false },
    @{ Path = 'api\contact.php'; Fatal = $false },
    @{ Path = 'assets';          Fatal = $false },
    @{ Path = '__l5e';           Fatal = $false },
    @{ Path = 'og-image.png';    Fatal = $false },
    @{ Path = 'robots.txt';      Fatal = $false },
    @{ Path = 'sitemap.xml';     Fatal = $false }
)

$missing = @()
foreach ($item in $expected) {
    $full = Join-Path $outDir $item.Path
    if (Test-Path $full) {
        Write-Ok $item.Path
    } elseif ($item.Fatal) {
        Write-Bad "$($item.Path) is missing and is required"
        exit 1
    } else {
        Write-Warn "$($item.Path) is missing"
        $missing += $item.Path
    }
}

if ($missing.Count -gt 0 -and -not $Force) {
    Write-Host ''
    Write-Bad "$($missing.Count) expected file(s) missing. Re-run with -Force to upload anyway."
    exit 1
}

# Dotfiles are the whole reason this script exists, so say what was found.
$dotfiles = @(Get-ChildItem -Path $outDir -Force -File |
              Where-Object { $_.Name.StartsWith('.') } |
              ForEach-Object { $_.Name })
if ($dotfiles.Count -gt 0) {
    Write-Ok "dotfiles to ship: $($dotfiles -join ', ')"
} else {
    Write-Warn 'no dotfiles in the build output (expected .htaccess)'
}

$fileCount = @(Get-ChildItem -Path $outDir -Force -Recurse -File).Count
Write-Host "    $fileCount file(s) total"

# ------------------------------------------------------------------ package

$stamp   = Get-Date -Format 'yyyyMMdd-HHmmss'
$tarName = "ngplus-deploy-$stamp.tar.gz"
$tarPath = Join-Path $env:TEMP $tarName

Write-Step 'Packing'
tar -czf $tarPath -C $outDir .
if ($LASTEXITCODE -ne 0) {
    Write-Bad "tar exited $LASTEXITCODE"
    exit 1
}
$sizeKb = [math]::Round((Get-Item $tarPath).Length / 1KB, 1)
Write-Ok "$tarName ($sizeKb KB)"

if ($DryRun) {
    Write-Step 'Dry run: nothing uploaded'
    Write-Host "    tarball left at $tarPath"
    exit 0
}

# ------------------------------------------------------------------- upload

try {
    Write-Step 'Uploading (password prompt 1 of 2)'
    scp -P $sshPort $tarPath "$sshUser@${sshHost}:~/$tarName"
    if ($LASTEXITCODE -ne 0) {
        Write-Bad "scp exited $LASTEXITCODE"
        exit 1
    }
    Write-Ok 'uploaded'

    $pruneCmd = ''
    if ($PruneAssets) {
        $pruneCmd = "rm -rf '$remote/assets' && "
        Write-Warn 'assets/ will be cleared before unpacking'
    }

    # Single remote command so there is only one more password prompt. set -e
    # so a failed step does not leave the tarball behind looking successful.
    $remoteScript = @(
        'set -e',
        "mkdir -p '$remote'",
        "$pruneCmd" + "tar -xzf ~/$tarName -C '$remote'",
        "rm -f ~/$tarName",
        "echo '--- deployed ---'",
        "ls -la '$remote' | head -20",
        "test -f '$remote/api/contact.php' && echo 'api/contact.php present' || echo 'api/contact.php MISSING'",
        "test -f '$remote/.htaccess' && echo '.htaccess present' || echo '.htaccess MISSING'"
    ) -join '; '

    Write-Step 'Unpacking on the server (password prompt 2 of 2)'
    ssh -p $sshPort "$sshUser@$sshHost" $remoteScript
    if ($LASTEXITCODE -ne 0) {
        Write-Bad "ssh exited $LASTEXITCODE. The tarball may still be in the home directory."
        exit 1
    }
    Write-Ok 'unpacked'
}
finally {
    if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
}

# -------------------------------------------------------------- verify live

Write-Step 'Verifying live site'

$apex = 'https://ngplustrailers.com/'
try {
    $r = Invoke-WebRequest -Uri $apex -Method Head -TimeoutSec 20 -UseBasicParsing
    Write-Ok "apex $($r.StatusCode) via $($r.Headers['Server'])"
} catch {
    Write-Warn "apex check failed: $($_.Exception.Message)"
}

$endpoint = 'https://ngplustrailers.com/api/contact.php'
try {
    $body = '{"email":"deploy-probe@example.com","requirements":"deploy.ps1 probe"}'
    $r = Invoke-WebRequest -Uri $endpoint -Method Post -ContentType 'application/json' `
             -Body $body -TimeoutSec 20 -UseBasicParsing
    if ($r.Content -like '*"ok":true*') {
        Write-Ok "endpoint responded ok (X-Mail-Status: $($r.Headers['X-Mail-Status']))"
    } elseif ($r.Content -like '*<!DOCTYPE html>*') {
        Write-Warn 'endpoint returned HTML: the .htaccess rewrite is swallowing /api/. It needs a !-f guard or an explicit exclusion.'
    } else {
        Write-Warn "endpoint returned an unexpected body: $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))"
    }
} catch {
    Write-Warn "endpoint check failed: $($_.Exception.Message)"
}

Write-Host ''
Write-Step 'Done'
Write-Host '    Note: public\.htaccess is repo-owned and is overwritten on every deploy.'
Write-Host '    Any server-side edit to public_html/.htaccess will not survive.'
