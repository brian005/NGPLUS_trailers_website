<#
    deploy.ps1  v3.0

    Builds the site and ships dist/client to ~/public_html on the Namecheap
    shared host.

    DEPLOYABLE MOVED (v3.0): nitro is disabled in vite.config.ts, so the build
    now follows TanStack Start's own defaults - client (plus prerendered
    index.html and everything copied from public/) lands in dist/client, and
    the SSR bundle the prerender crawls lands in dist/server. There is no
    .output any more; one lying around is from the nitro era and is dead.

    CONSISTENCY CHECK (new in v3.0): after the build, every asset filename
    referenced by index.html is checked against the files actually present in
    assets/. A mismatch is FATAL. This is the check that would have caught the
    Jul 25 incident, where a stale prerender emitted HTML referencing assets
    the build never produced and the deploy shipped it faithfully.

    SPLIT PAYLOAD (new in v2.0)
    .output/public is about 790 MB, essentially all of it the videos and
    images under __l5e. Those change rarely; the code changes constantly.
    v1.x packed everything every time, so a one-line PHP edit cost a 790 MB
    upload, and it gzipped the video on the way, which burns CPU for no size
    win at all.

    So: media is EXCLUDED by default. A routine deploy ships roughly a
    megabyte. Pass -WithMedia when anything under __l5e has changed, or on a
    first deploy to a fresh account. The media tarball is not gzipped, because
    compressing MP4 is a waste of time.

    The safety net for forgetting the flag: the remote step always counts the
    files actually present under __l5e and prints that next to the local
    count, so drift is visible. The check rides in the ssh call the script
    already makes, so it costs no extra password prompt.

    WHY TAR AND NOT SCP DIRECTLY
    "scp -r .output\public\* host:dir" silently skips dotfiles, because the
    glob is expanded by the shell and * does not match names beginning with a
    dot. That would omit .htaccess, which owns the https redirect, the
    directory-index blocking, and the SetEnv config the contact endpoint can
    read. The deploy would report success and break three things at once.
    Packing named entries with tar includes dotfiles and unpacks with the tree
    intact.

    Tarballs are written to $env:TEMP, never to Downloads, and are removed
    afterwards.

    NON-DESTRUCTIVE by default: files unpack over the top of what is already
    there. Nothing is deleted, so hash-named files from previous builds
    accumulate in public_html/assets. Pass -PruneAssets to empty that one
    directory before unpacking; it is entirely build-owned, so that is safe,
    whereas a blanket delete of public_html is not - it would take
    .well-known/acme-challenge with it, which acme.sh needs at renewal.

    CONFIG - environment variables, so this file is drop-in with no edits:
      NGP_SSH_HOST    default 198.54.116.242
      NGP_SSH_USER    default ngplus
      NGP_SSH_PORT    default 21098
      NGP_REMOTE_DIR  default /home/ngplus/public_html

    USAGE - note the execution-policy bypass; an unsigned local .ps1 will not
    run without it, and files saved from a browser carry mark-of-the-web so a
    persistent RemoteSigned policy would still need Unblock-File each time.

      powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -DryRun
      powershell -ExecutionPolicy Bypass -File .\deploy.ps1
      powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -WithMedia
      powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -SkipBuild -PruneAssets

    Switches
      -SkipBuild    upload the existing .output/public without rebuilding
      -DryRun       build, verify and pack; upload nothing
      -WithMedia    include __l5e (large; only when media changed)
      -PruneAssets  clear remote assets/ before unpacking
      -Force        upload even if an expected file is missing

    One password prompt per transfer plus one for the remote step. An SSH key
    in ~/.ssh/authorized_keys on the server removes them all.
#>

[CmdletBinding()]
param(
    [switch] $SkipBuild,
    [switch] $DryRun,
    [switch] $WithMedia,
    [switch] $PruneAssets,
    [switch] $Force
)

$ErrorActionPreference = 'Stop'

$MediaDirName = '__l5e'

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

function Format-Size {
    param([long] $Bytes)
    if ($Bytes -ge 1GB) { return "$([math]::Round($Bytes / 1GB, 2)) GB" }
    if ($Bytes -ge 1MB) { return "$([math]::Round($Bytes / 1MB, 2)) MB" }
    return "$([math]::Round($Bytes / 1KB, 1)) KB"
}

# ------------------------------------------------------------------ config

$sshHost = Get-Config 'NGP_SSH_HOST'   '198.54.116.242'
$sshUser = Get-Config 'NGP_SSH_USER'   'ngplus'
$sshPort = Get-Config 'NGP_SSH_PORT'   '21098'
$remote  = Get-Config 'NGP_REMOTE_DIR' '/home/ngplus/public_html'

$repoRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($repoRoot)) { $repoRoot = (Get-Location).Path }
$outDir = Join-Path $repoRoot 'dist\client'

Write-Step 'Configuration'
Write-Host "    host    $sshUser@$sshHost port $sshPort"
Write-Host "    remote  $remote"
Write-Host "    local   $outDir"
if ($WithMedia) {
    Write-Host "    media   INCLUDED ($MediaDirName)"
} else {
    Write-Host "    media   excluded ($MediaDirName) - pass -WithMedia to send it"
}

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

if (Test-Path (Join-Path $repoRoot '.output')) {
    Write-Warn 'legacy .output directory present (nitro era) - no longer used or deployed; safe to delete'
}

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
    Write-Bad 'Expected dist\client (nitro disabled). If you see .output instead, vite.config.ts is stale.'
    exit 1
}

# -------------------------------------------------------- verify build out

Write-Step 'Verifying build output'

# index.html is fatal. The rest are warnings: a missing one usually means a
# source file was never saved into the repo, which is worth seeing before an
# upload rather than discovering from a 404 afterwards.
$expected = @(
    @{ Path = 'index.html';       Fatal = $true  },
    @{ Path = '.htaccess';        Fatal = $false },
    @{ Path = 'api\contact.php';  Fatal = $false },
    @{ Path = 'assets';           Fatal = $false },
    @{ Path = $MediaDirName;      Fatal = $false },
    @{ Path = 'og-image.png';     Fatal = $false },
    @{ Path = 'robots.txt';       Fatal = $false },
    @{ Path = 'sitemap.xml';      Fatal = $false }
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

# ---------------------------------------------- index/assets consistency

# Every css/js filename index.html references must exist in assets/. A stale
# prerender referencing assets this build never produced is exactly how the
# Jul 25 incident shipped; it is FATAL here, -Force does not override it,
# because uploading an internally inconsistent build is never right.
Write-Step 'Checking index.html against assets'

$indexPath = Join-Path $outDir 'index.html'
$refs = @(Select-String -Path $indexPath -Pattern 'assets/[A-Za-z0-9_.-]+\.(css|js)' -AllMatches |
          ForEach-Object { $_.Matches.Value } |
          ForEach-Object { ($_ -split '/')[-1] } |
          Sort-Object -Unique)
$present = @(Get-ChildItem (Join-Path $outDir 'assets') -Name -ErrorAction SilentlyContinue)
$danglingRefs = @($refs | Where-Object { $_ -notin $present })

if ($refs.Count -eq 0) {
    Write-Warn 'index.html references no hashed assets at all - that is unusual; inspect it before trusting this build'
} elseif ($danglingRefs.Count -gt 0) {
    Write-Bad "index.html references $($danglingRefs.Count) asset(s) this build did not produce:"
    foreach ($r in $danglingRefs) { Write-Bad "    $r" }
    Write-Bad 'The prerender and the client build disagree. Do not deploy this.'
    exit 1
} else {
    Write-Ok "index.html and assets agree ($($refs.Count) referenced, all present)"
}

# --------------------------------------------------- split code from media

$mediaPath  = Join-Path $outDir $MediaDirName
$mediaFiles = @()
$mediaBytes = 0
if (Test-Path $mediaPath) {
    $mediaFiles = @(Get-ChildItem -Path $mediaPath -Force -Recurse -File)
    if ($mediaFiles.Count -gt 0) {
        $mediaBytes = ($mediaFiles | Measure-Object -Property Length -Sum).Sum
    }
}
$mediaCount = $mediaFiles.Count

# Top-level entries, dotfiles included. Named explicitly so tar cannot miss a
# dotfile and so excluding one directory needs no fragile glob pattern.
$topLevel  = @(Get-ChildItem -Path $outDir -Force | ForEach-Object { $_.Name })
$codeNames = @($topLevel | Where-Object { $_ -ne $MediaDirName })

if ($codeNames.Count -eq 0) {
    Write-Bad 'Nothing to deploy: no entries outside the media directory.'
    exit 1
}

$codeBytes = 0
foreach ($n in $codeNames) {
    $p = Join-Path $outDir $n
    if (Test-Path $p -PathType Container) {
        $kids = @(Get-ChildItem -Path $p -Force -Recurse -File)
        if ($kids.Count -gt 0) {
            $codeBytes += ($kids | Measure-Object -Property Length -Sum).Sum
        }
    } else {
        $codeBytes += (Get-Item $p -Force).Length
    }
}

$dotfiles = @($topLevel | Where-Object { $_.StartsWith('.') })
if ($dotfiles.Count -gt 0) {
    Write-Ok "dotfiles to ship: $($dotfiles -join ', ')"
} else {
    Write-Warn 'no dotfiles in the build output (expected .htaccess)'
}

Write-Host "    code    $($codeNames.Count) entries, $(Format-Size $codeBytes)"
Write-Host "    media   $mediaCount files, $(Format-Size $mediaBytes)"

# ------------------------------------------------------------------ package

$stamp     = Get-Date -Format 'yyyyMMdd-HHmmss'
$codeTar   = Join-Path $env:TEMP "ngplus-code-$stamp.tar.gz"
$mediaTar  = Join-Path $env:TEMP "ngplus-media-$stamp.tar"
$madeMedia = $false

Write-Step 'Packing code'
tar -czf $codeTar -C $outDir $codeNames
if ($LASTEXITCODE -ne 0) {
    Write-Bad "tar exited $LASTEXITCODE packing code"
    exit 1
}
Write-Ok "$(Split-Path $codeTar -Leaf) ($(Format-Size (Get-Item $codeTar).Length))"

if ($WithMedia -and $mediaCount -gt 0) {
    Write-Step 'Packing media (no gzip - MP4 does not compress)'
    tar -cf $mediaTar -C $outDir $MediaDirName
    if ($LASTEXITCODE -ne 0) {
        Write-Bad "tar exited $LASTEXITCODE packing media"
        exit 1
    }
    $madeMedia = $true
    Write-Ok "$(Split-Path $mediaTar -Leaf) ($(Format-Size (Get-Item $mediaTar).Length))"
} elseif ($WithMedia) {
    Write-Warn "-WithMedia given but $MediaDirName has no files"
}

if ($DryRun) {
    Write-Step 'Dry run: nothing uploaded'
    Write-Host "    code tarball  $codeTar"
    if ($madeMedia) { Write-Host "    media tarball $mediaTar" }
    Write-Host '    (these stay in TEMP on a dry run; a real run cleans up after itself)'
    exit 0
}

# ------------------------------------------------------------------- upload

try {
    $codeName = Split-Path $codeTar -Leaf
    Write-Step 'Uploading code'
    scp -P $sshPort $codeTar "$sshUser@${sshHost}:~/$codeName"
    if ($LASTEXITCODE -ne 0) {
        Write-Bad "scp exited $LASTEXITCODE uploading code"
        exit 1
    }
    Write-Ok 'code uploaded'

    $mediaName = $null
    if ($madeMedia) {
        $mediaName = Split-Path $mediaTar -Leaf
        Write-Step "Uploading media ($(Format-Size (Get-Item $mediaTar).Length)) - this will take a while"
        scp -P $sshPort $mediaTar "$sshUser@${sshHost}:~/$mediaName"
        if ($LASTEXITCODE -ne 0) {
            Write-Bad "scp exited $LASTEXITCODE uploading media"
            exit 1
        }
        Write-Ok 'media uploaded'
    }

    $steps = @('set -e', "mkdir -p '$remote'")
    if ($PruneAssets) {
        Write-Warn 'assets/ will be cleared before unpacking'
        $steps += "rm -rf '$remote/assets'"
    }
    $steps += "tar -xzf ~/$codeName -C '$remote'"
    $steps += "rm -f ~/$codeName"
    if ($mediaName) {
        $steps += "tar -xf ~/$mediaName -C '$remote'"
        $steps += "rm -f ~/$mediaName"
    }
    $steps += "echo '--- deployed ---'"
    $steps += "ls -la '$remote' | head -20"
    $steps += "test -f '$remote/api/contact.php' && echo 'CHECK api/contact.php present' || echo 'CHECK api/contact.php MISSING'"
    $steps += "test -f '$remote/.htaccess' && echo 'CHECK .htaccess present' || echo 'CHECK .htaccess MISSING'"
    # Media drift check rides in this ssh call, so it costs no extra prompt.
    $steps += "echo -n 'CHECK media files remote: '; find '$remote/$MediaDirName' -type f 2>/dev/null | wc -l"

    Write-Step 'Unpacking on the server'
    ssh -p $sshPort "$sshUser@$sshHost" ($steps -join '; ')
    if ($LASTEXITCODE -ne 0) {
        Write-Bad "ssh exited $LASTEXITCODE. A tarball may still be in the remote home directory."
        exit 1
    }
    Write-Ok 'unpacked'
    Write-Host ''
    Write-Warn "Local $MediaDirName file count is $mediaCount. If the remote count above differs, re-run with -WithMedia."
}
finally {
    foreach ($t in @($codeTar, $mediaTar)) {
        if ($t -and (Test-Path $t)) { Remove-Item $t -Force }
    }
}

# -------------------------------------------------------------- verify live

Write-Step 'Verifying live site'

try {
    $r = Invoke-WebRequest -Uri 'https://ngplustrailers.com/' -Method Head -TimeoutSec 20 -UseBasicParsing
    Write-Ok "apex $($r.StatusCode) via $($r.Headers['Server'])"
} catch {
    Write-Warn "apex check failed: $($_.Exception.Message)"
}

try {
    $body = '{"email":"deploy-probe@example.com","requirements":"deploy.ps1 probe"}'
    $r = Invoke-WebRequest -Uri 'https://ngplustrailers.com/api/contact.php' -Method Post `
             -ContentType 'application/json' -Body $body -TimeoutSec 20 -UseBasicParsing
    if ($r.Content -like '*"ok":true*') {
        Write-Ok "endpoint ok (X-Mail-Status: $($r.Headers['X-Mail-Status']))"
    } elseif ($r.Content -like '*<!DOCTYPE html>*') {
        Write-Warn 'endpoint returned HTML: the .htaccess rewrite is swallowing /api/. It needs a !-f guard or an explicit exclusion.'
    } else {
        $snip = $r.Content.Substring(0, [Math]::Min(200, $r.Content.Length))
        Write-Warn "endpoint returned an unexpected body: $snip"
    }
} catch {
    Write-Warn "endpoint check failed: $($_.Exception.Message)"
}

Write-Host ''
Write-Step 'Done'
Write-Host '    Note: public\.htaccess is repo-owned and is overwritten on every deploy.'
Write-Host '    Any server-side edit to public_html/.htaccess will not survive.'
