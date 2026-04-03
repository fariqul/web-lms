[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupDir,

    [string]$ProjectPath = "D:\project-amsp",
    [switch]$SkipBuild,
    [switch]$SkipHashVerification
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# PowerShell 7+ dapat mengubah stderr native command menjadi error record.
# Untuk tool CLI seperti docker/mysql, kita tangani kegagalan pakai exit code.
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

function Write-Step {
    param([string]$Message)
    Write-Host "[STEP] $Message" -ForegroundColor Cyan
}

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Command '$Name' tidak ditemukan. Install dulu sebelum lanjut."
    }
}

function Wait-ContainerRunning {
    param(
        [string]$ContainerName,
        [int]$MaxAttempts = 40,
        [int]$SleepSeconds = 3
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        $state = ''
        try {
            $state = (docker inspect -f '{{.State.Running}}' $ContainerName 2>$null).Trim()
        }
        catch {
            $state = ''
        }

        if ($state -eq 'true') {
            return
        }

        Start-Sleep -Seconds $SleepSeconds
    }

    throw "Container '$ContainerName' belum running setelah menunggu."
}

function Set-OrAddEnvLine {
    param(
        [string]$FilePath,
        [string]$Key,
        [string]$Value
    )

    $lines = @()
    if (Test-Path $FilePath) {
        $lines = Get-Content $FilePath
    }

    $prefix = "$Key="
    $updated = $false

    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].StartsWith($prefix)) {
            $lines[$i] = "$Key=$Value"
            $updated = $true
            break
        }
    }

    if (-not $updated) {
        $lines += "$Key=$Value"
    }

    Set-Content -Path $FilePath -Value $lines -Encoding ascii
}

function Verify-Checksums {
    param([string]$Folder)

    $checksumFile = Join-Path $Folder 'checksums.sha256'
    if (-not (Test-Path $checksumFile)) {
        Write-Warning "File checksum tidak ditemukan: $checksumFile"
        return
    }

    $lines = Get-Content $checksumFile | Where-Object { $_.Trim().Length -gt 0 }
    foreach ($line in $lines) {
        if ($line -notmatch '^([a-fA-F0-9]{64}) \*(.+)$') {
            throw "Format checksum tidak valid: $line"
        }

        $expectedHash = $Matches[1].ToLowerInvariant()
        $fileName = $Matches[2]
        $filePath = Join-Path $Folder $fileName

        if (-not (Test-Path $filePath)) {
            throw "File untuk verifikasi tidak ditemukan: $fileName"
        }

        $actualHash = (Get-FileHash $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne $expectedHash) {
            throw "Checksum mismatch untuk $fileName"
        }
    }
}

Assert-Command -Name 'docker'
Assert-Command -Name 'git'

if (-not (Test-Path $BackupDir)) {
    throw "BackupDir tidak ditemukan: $BackupDir"
}

if (-not (Test-Path $ProjectPath)) {
    throw "ProjectPath tidak ditemukan: $ProjectPath"
}

$requiredFiles = @('database.sql', 'backend-storage.tar.gz', '.env')
foreach ($requiredFile in $requiredFiles) {
    $fullPath = Join-Path $BackupDir $requiredFile
    if (-not (Test-Path $fullPath)) {
        throw "File wajib backup tidak ada: $fullPath"
    }
}

Write-Step "Masuk ke folder project"
Set-Location $ProjectPath

if (-not $SkipHashVerification) {
    Write-Step "Verifikasi checksum backup"
    Verify-Checksums -Folder $BackupDir
    Write-Host 'Checksum valid.' -ForegroundColor Green
}
else {
    Write-Warning 'Skip checksum verification aktif. Ini meningkatkan risiko korup data.'
}

Write-Step "Salin .env dari backup"
Copy-Item (Join-Path $BackupDir '.env') (Join-Path $ProjectPath '.env') -Force

$appKeyBackupPath = Join-Path $BackupDir 'app_key.txt'
if (Test-Path $appKeyBackupPath) {
    $appKeyLine = (Get-Content $appKeyBackupPath -Raw).Trim()
    if ($appKeyLine -match '^APP_KEY=(.+)$') {
        $appKeyValue = $Matches[1]
        if (-not [string]::IsNullOrWhiteSpace($appKeyValue)) {
            Write-Step "Sinkronkan APP_KEY ke .env"
            Set-OrAddEnvLine -FilePath (Join-Path $ProjectPath '.env') -Key 'APP_KEY' -Value $appKeyValue
        }
    }
    else {
        Write-Warning 'app_key.txt tidak berisi APP_KEY valid. Lewati sinkron APP_KEY otomatis.'
    }
}
else {
    Write-Warning 'app_key.txt tidak ditemukan. Pastikan APP_KEY di .env sudah benar.'
}

$composePath = Join-Path $ProjectPath 'docker-compose.yml'
$composeContent = Get-Content $composePath -Raw
if ($composeContent -notmatch 'APP_KEY:\s*\$\{APP_KEY\}') {
    Write-Warning 'docker-compose.yml belum memetakan APP_KEY: ${APP_KEY} di service backend.'
    Write-Warning 'Tambahkan mapping APP_KEY agar key tidak berubah setelah restart container.'
}

if (-not $SkipBuild) {
    Write-Step "Build ulang image"
    docker compose build --no-cache
}
else {
    Write-Warning 'Skip build aktif. Pastikan image di PC baru sudah sesuai commit sumber.'
}

Write-Step "Start MySQL"
docker compose up -d mysql

Write-Step "Tunggu MySQL healthy"
$maxAttempts = 60
$sleepSeconds = 5
$healthy = $false

for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $status = ''
    try {
        $status = (docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' lms-mysql 2>$null).Trim()
    }
    catch {
        $status = ''
    }

    if ($status -eq 'healthy' -or $status -eq 'running') {
        $healthy = $true
        break
    }

    Start-Sleep -Seconds $sleepSeconds
}

if (-not $healthy) {
    throw 'MySQL belum healthy setelah menunggu. Cek docker logs lms-mysql.'
}

Write-Step "Import database"
docker cp (Join-Path $BackupDir 'database.sql') 'lms-mysql:/tmp/database.sql'
docker exec lms-mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < /tmp/database.sql'
docker exec lms-mysql sh -lc 'rm -f /tmp/database.sql' | Out-Null

Write-Step "Start backend"
docker compose up -d backend
Wait-ContainerRunning -ContainerName 'lms-backend'

Write-Step "Restore storage backend"
docker cp (Join-Path $BackupDir 'backend-storage.tar.gz') 'lms-backend:/tmp/backend-storage.tar.gz'
docker exec lms-backend sh -lc 'mkdir -p /var/www/html/storage && rm -rf /var/www/html/storage/* && tar -xzf /tmp/backend-storage.tar.gz -C /var/www/html/storage && chown -R www-data:www-data /var/www/html/storage && rm -f /tmp/backend-storage.tar.gz'

Write-Step "Start semua service"
docker compose up -d

Write-Step "Tampilkan status service"
docker compose ps

Write-Host ''
Write-Host 'Restore selesai dengan sukses.' -ForegroundColor Green
Write-Host 'Lanjutkan verifikasi fungsi aplikasi sebelum cutover produksi.' -ForegroundColor Yellow
Write-Host 'Cek URL tunnel: docker logs lms-tunnel --tail 100' -ForegroundColor Yellow
