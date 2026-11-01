$ErrorActionPreference = 'Stop'

$mysqlAdmin = Get-ChildItem 'C:\Program Files\MySQL' -Recurse -Filter 'mysqladmin.exe' -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName

if (-not $mysqlAdmin) {
    throw 'mysqladmin.exe was not found.'
}

& $mysqlAdmin --protocol=TCP --host=127.0.0.1 --port=3307 --user=root --skip-password shutdown

if ($LASTEXITCODE -ne 0) {
    throw 'Unable to stop local MySQL.'
}

Write-Host 'Local MySQL stopped.'
