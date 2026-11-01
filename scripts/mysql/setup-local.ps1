$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$mysqlRoot = Join-Path $env:LOCALAPPDATA 'Vates\MySQL'
$dataDirectory = Join-Path $mysqlRoot 'data'
$configPath = Join-Path $mysqlRoot 'my.ini'
$errorLogPath = Join-Path $mysqlRoot 'mysql-error.log'
$pidPath = Join-Path $mysqlRoot 'mysql.pid'
$envPath = Join-Path $projectRoot '.env.local'
$mysqlBin = Get-ChildItem 'C:\Program Files\MySQL' -Recurse -Filter 'mysqld.exe' -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty DirectoryName

if (-not $mysqlBin) {
    throw 'MySQL Server was not found. Install Oracle.MySQL with winget.'
}

New-Item -ItemType Directory -Force -Path $mysqlRoot | Out-Null

$normalizedBaseDirectory = ($mysqlBin | Split-Path -Parent).Replace('\', '/')
$normalizedDataDirectory = $dataDirectory.Replace('\', '/')
$normalizedErrorLogPath = $errorLogPath.Replace('\', '/')
$normalizedPidPath = $pidPath.Replace('\', '/')

$config = @"
[mysqld]
basedir=$normalizedBaseDirectory
datadir=$normalizedDataDirectory
port=3307
bind-address=127.0.0.1
mysqlx=0
character-set-server=utf8mb4
collation-server=utf8mb4_0900_ai_ci
max_allowed_packet=128M
log-error=$normalizedErrorLogPath
pid-file=$normalizedPidPath
"@
Set-Content -LiteralPath $configPath -Value $config -Encoding ascii

$mysqld = Join-Path $mysqlBin 'mysqld.exe'
$mysql = Join-Path $mysqlBin 'mysql.exe'

if (-not (Test-Path (Join-Path $dataDirectory 'mysql'))) {
    New-Item -ItemType Directory -Force -Path $dataDirectory | Out-Null
    & $mysqld "--defaults-file=$configPath" --initialize-insecure

    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to initialize the local MySQL data directory.'
    }
}

$isRunning = $false
try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $client.Connect('127.0.0.1', 3307)
    $client.Dispose()
    $isRunning = $true
} catch {
    $isRunning = $false
}

if (-not $isRunning) {
    Start-Process -FilePath $mysqld -ArgumentList "--defaults-file=$configPath" -WindowStyle Hidden

    for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
        Start-Sleep -Milliseconds 500
        try {
            $client = [System.Net.Sockets.TcpClient]::new()
            $client.Connect('127.0.0.1', 3307)
            $client.Dispose()
            $isRunning = $true
            break
        } catch {
            $isRunning = $false
        }
    }
}

if (-not $isRunning) {
    throw "MySQL did not start. Check the log: $errorLogPath"
}

$existingEnv = if (Test-Path $envPath) { Get-Content -LiteralPath $envPath } else { @() }
$existingPasswordLine = $existingEnv | Where-Object { $_ -match '^MYSQL_PASSWORD=' } | Select-Object -First 1
$appPassword = if ($existingPasswordLine) {
    ($existingPasswordLine -split '=', 2)[1]
} else {
    ([Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')).Substring(0, 40)
}

$bootstrapSql = @"
CREATE DATABASE IF NOT EXISTS vates_local CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'vates_app'@'127.0.0.1' IDENTIFIED BY '$appPassword';
ALTER USER 'vates_app'@'127.0.0.1' IDENTIFIED BY '$appPassword';
GRANT ALL PRIVILEGES ON vates_local.* TO 'vates_app'@'127.0.0.1';
FLUSH PRIVILEGES;
"@
& $mysql --protocol=TCP --host=127.0.0.1 --port=3307 --user=root --skip-password "--execute=$bootstrapSql"

if ($LASTEXITCODE -ne 0) {
    throw 'Unable to create the local database and application user.'
}

$mysqlVariables = [ordered]@{
    DATA_BACKEND = 'mysql'
    MYSQL_HOST = '127.0.0.1'
    MYSQL_PORT = '3307'
    MYSQL_DATABASE = 'vates_local'
    MYSQL_USER = 'vates_app'
    MYSQL_PASSWORD = $appPassword
    MYSQL_CONNECTION_LIMIT = '10'
    MYSQL_SSL = 'false'
}

$retainedLines = $existingEnv | Where-Object {
    $line = $_
    -not ($mysqlVariables.Keys | Where-Object { $line -match "^$([Regex]::Escape($_))=" })
}
$newLines = @($retainedLines)

if ($newLines.Count -gt 0 -and $newLines[-1] -ne '') {
    $newLines += ''
}

$newLines += '# Local Vates MySQL. This file is excluded from Git.'
$newLines += $mysqlVariables.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
Set-Content -LiteralPath $envPath -Value $newLines -Encoding ascii

Push-Location $projectRoot
try {
    & npm.cmd run db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'MySQL migrations failed.' }

    & npm.cmd run db:import-json
    if ($LASTEXITCODE -ne 0) { throw 'JSON import into MySQL failed.' }

    & npm.cmd run db:verify-json
    if ($LASTEXITCODE -ne 0) { throw 'MySQL data verification failed.' }

    & npm.cmd run db:health
    if ($LASTEXITCODE -ne 0) { throw 'MySQL health check failed.' }
} finally {
    Pop-Location
}

Write-Host 'Local MySQL is ready on 127.0.0.1:3307.'
Write-Host "MySQL data directory: $dataDirectory"
Write-Host 'The application now uses DATA_BACKEND=mysql from .env.local.'
