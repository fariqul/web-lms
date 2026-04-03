[CmdletBinding()]
param(
    [string]$ProjectPath = "D:\project-amsp",
    [string]$BackupRoot = "D:\lms-migration-backup",
    [switch]$SkipMaintenanceMode
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# PowerShell 7+ dapat mengubah stderr native command menjadi error record.
# Untuk tool CLI seperti docker/mysqldump, kita tangani kegagalan pakai exit code.
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

function Assert-ContainerRunning {
    param([string]$ContainerName)

    $state = (docker inspect -f '{{.State.Running}}' $ContainerName 2>$null)
    if ($LASTEXITCODE -ne 0 -or $state.Trim() -ne 'true') {
        throw "Container '$ContainerName' tidak running. Jalankan docker compose up -d terlebih dahulu."
    }
}

function Save-OptionalFile {
    param(
        [string]$SourcePath,
        [string]$DestinationPath
    )

    if (Test-Path $SourcePath) {
        Copy-Item $SourcePath $DestinationPath -Force
    }
    else {
        Write-Warning "File opsional tidak ditemukan: $SourcePath"
    }
}

Assert-Command -Name 'docker'
Assert-Command -Name 'git'

if (-not (Test-Path $ProjectPath)) {
    throw "Project path tidak ditemukan: $ProjectPath"
}

$timeStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $BackupRoot "backup-$timeStamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$maintenanceEnabledByScript = $false

try {
    Write-Step "Masuk ke folder project"
    Set-Location $ProjectPath

    if (-not (Test-Path (Join-Path $ProjectPath '.env'))) {
        throw "File wajib tidak ditemukan: $ProjectPath\.env"
    }
    if (-not (Test-Path (Join-Path $ProjectPath 'docker-compose.yml'))) {
        throw "File wajib tidak ditemukan: $ProjectPath\docker-compose.yml"
    }

    Assert-ContainerRunning -ContainerName 'lms-backend'
    Assert-ContainerRunning -ContainerName 'lms-mysql'

    Write-Step "Simpan metadata deployment"
    git rev-parse HEAD | Out-File -Encoding ascii (Join-Path $backupDir 'git-commit.txt')
    docker compose config | Out-File -Encoding utf8 (Join-Path $backupDir 'docker-compose-resolved.yml')
    docker compose ps | Out-File -Encoding utf8 (Join-Path $backupDir 'compose-ps.txt')

    Write-Step "Simpan file konfigurasi"
    Copy-Item (Join-Path $ProjectPath '.env') (Join-Path $backupDir '.env') -Force
    Save-OptionalFile -SourcePath (Join-Path $ProjectPath '.env.homeserver') -DestinationPath (Join-Path $backupDir '.env.homeserver')
    Copy-Item (Join-Path $ProjectPath 'docker-compose.yml') (Join-Path $backupDir 'docker-compose.yml') -Force
    Save-OptionalFile -SourcePath (Join-Path $ProjectPath 'mysql\custom.cnf') -DestinationPath (Join-Path $backupDir 'custom.cnf')
    Save-OptionalFile -SourcePath (Join-Path $ProjectPath 'nginx\default.conf') -DestinationPath (Join-Path $backupDir 'default.conf')

    if (-not $SkipMaintenanceMode) {
        Write-Step "Aktifkan maintenance mode Laravel"
        docker exec lms-backend php artisan down | Out-File -Encoding utf8 (Join-Path $backupDir 'maintenance-down.log')
        $maintenanceEnabledByScript = $true
    }
    else {
        Write-Warning 'Skip maintenance mode aktif. Pastikan tidak ada user aktif saat backup.'
    }

    Write-Step "Ambil APP_KEY aktif dari container"
    docker exec lms-backend sh -lc 'grep ^APP_KEY= /var/www/html/.env || true' | Out-File -Encoding ascii (Join-Path $backupDir 'app_key.txt')

    $appKeyLine = (Get-Content (Join-Path $backupDir 'app_key.txt') -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($appKeyLine) -or $appKeyLine -eq 'APP_KEY=') {
        Write-Warning 'APP_KEY tidak terbaca dari container. Pastikan APP_KEY tersimpan di backup secara manual.'
    }

    Write-Step "Dump database MySQL"
    $dbDumpPath = Join-Path $backupDir 'database.sql'
    $dbDumpErrPath = Join-Path $backupDir 'database-dump.stderr.log'
    docker exec lms-mysql sh -lc 'mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --databases "$MYSQL_DATABASE" --single-transaction --routines --triggers --events --set-gtid-purged=OFF --no-tablespaces' 1> $dbDumpPath 2> $dbDumpErrPath
    if ($LASTEXITCODE -ne 0) {
        $dumpErrPreview = if (Test-Path $dbDumpErrPath) { (Get-Content $dbDumpErrPath -Tail 20) -join [Environment]::NewLine } else { 'Tidak ada detail error.' }
        throw "mysqldump gagal (exit code $LASTEXITCODE). Detail: $dumpErrPreview"
    }

    $dbFile = Get-Item (Join-Path $backupDir 'database.sql')
    if ($dbFile.Length -lt 1024) {
        throw "File database.sql terlalu kecil ($($dbFile.Length) bytes). Backup dibatalkan."
    }

    Write-Step "Arsip storage backend"
    docker exec lms-backend sh -lc 'cd /var/www/html/storage && tar -czf /tmp/backend-storage.tar.gz .'
    docker cp lms-backend:/tmp/backend-storage.tar.gz (Join-Path $backupDir 'backend-storage.tar.gz')
    docker exec lms-backend sh -lc 'rm -f /tmp/backend-storage.tar.gz' | Out-Null

    $storageFile = Get-Item (Join-Path $backupDir 'backend-storage.tar.gz')
    if ($storageFile.Length -lt 512) {
        throw "File backend-storage.tar.gz terlalu kecil ($($storageFile.Length) bytes). Backup dibatalkan."
    }

    Write-Step "Buat checksum SHA256"
    $checksumItems = @('database.sql', 'backend-storage.tar.gz', '.env', 'docker-compose.yml', 'app_key.txt')
    $checksumLines = @()

    foreach ($item in $checksumItems) {
        $itemPath = Join-Path $backupDir $item
        if (Test-Path $itemPath) {
            $hash = (Get-FileHash $itemPath -Algorithm SHA256).Hash.ToLowerInvariant()
            $checksumLines += "$hash *$item"
        }
    }

    Set-Content -Path (Join-Path $backupDir 'checksums.sha256') -Value $checksumLines -Encoding ascii

    Write-Step "Simpan ringkasan backup"
    $summary = @(
        "BackupDir=$backupDir",
        "CreatedAt=$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))",
        "GitCommit=$((Get-Content (Join-Path $backupDir 'git-commit.txt') -Raw).Trim())",
        "DatabaseSizeBytes=$($dbFile.Length)",
        "StorageSizeBytes=$($storageFile.Length)",
        "MaintenanceModeUsed=$($SkipMaintenanceMode -eq $false)"
    )

    Set-Content -Path (Join-Path $backupDir 'backup-summary.txt') -Value $summary -Encoding ascii

    Write-Host ''
    Write-Host 'Backup selesai dengan sukses.' -ForegroundColor Green
    Write-Host "Lokasi backup: $backupDir" -ForegroundColor Green
    Write-Host 'Pindahkan seluruh folder backup ke PC baru sebelum restore.' -ForegroundColor Yellow
}
finally {
    if ($maintenanceEnabledByScript) {
        Write-Step "Matikan maintenance mode Laravel"
        try {
            docker exec lms-backend php artisan up | Out-Null
            Write-Host 'Maintenance mode nonaktif.' -ForegroundColor Green
        }
        catch {
            Write-Warning "Gagal menonaktifkan maintenance mode otomatis: $($_.Exception.Message)"
            Write-Warning 'Jalankan manual: docker exec lms-backend php artisan up'
        }
    }
}
