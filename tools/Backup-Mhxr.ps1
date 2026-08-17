<#
.SYNOPSIS
    Backup e ripristino del database MHXR, in un comando solo.

.DESCRIPTION
    Il database non e' una cartella che puoi copiare: vive dentro un volume
    Docker (apypos-server-main_mongo_data) nella macchina virtuale di WSL2.
    Questo script lo esporta in un unico file .gz, portabile su qualsiasi PC.

    Dentro ci sono personaggio, eventi, blocchi delle quest: tutto il lavoro.
    Il codice del server invece si riscarica da GitHub, quindi l'unica cosa
    che vale davvero la pena conservare e' questo file.

    NB: il dump viene scritto DENTRO il container e poi estratto con docker cp.
    Non si usa il redirect ">" di PowerShell perche' corrompe i file binari.

.PARAMETER Restore
    Ripristina invece di salvare. Va indicato -File con l'archivio da caricare.

.PARAMETER File
    Percorso dell'archivio. In backup e' opzionale (si genera col timestamp),
    in ripristino e' obbligatorio.

.EXAMPLE
    .\Backup-Mhxr.ps1
    Crea D:\MHXR_ServerHack\backup\apypos-<data>-<ora>.gz

.EXAMPLE
    .\Backup-Mhxr.ps1 -Restore -File D:\MHXR_ServerHack\backup\apypos-20260814-1930.gz
#>
[CmdletBinding()]
param(
    [switch]$Restore,
    [string]$File
)

$ErrorActionPreference = 'Stop'

# Percorsi ricavati da dove sta lo script, non scritti fissi: questo file vive
# in <radice>\tools\, quindi il progetto e i backup sono accanto. Cosi' basta
# copiare le cartelle su un altro PC e funziona senza modificare niente.
$RADICE   = Split-Path -Parent $PSScriptRoot
$PROGETTO = Join-Path $RADICE 'apypos-server'
$COMPOSE  = 'docker-compose.prod.yml'
$DEST_DIR = Join-Path $RADICE 'backup'

if (-not (Test-Path -LiteralPath $PROGETTO)) { throw "Cartella del server non trovata: $PROGETTO" }

Push-Location $PROGETTO
try {
    # la password sta nel .env: non va scritta a mano nel comando
    $envFile = Join-Path $PROGETTO '.env'
    if (-not (Test-Path -LiteralPath $envFile)) { throw "Manca il file .env in $PROGETTO" }
    $pw = (Get-Content -LiteralPath $envFile | Where-Object { $_ -like 'DB_PASSWORD=*' }) -replace 'DB_PASSWORD=', ''
    if ([string]::IsNullOrWhiteSpace($pw)) { throw "DB_PASSWORD non trovata nel .env" }

    $cid = (docker compose -f $COMPOSE ps -q mongo).Trim()
    if ([string]::IsNullOrWhiteSpace($cid)) { throw "Il container mongo non e' in esecuzione. Avvia lo stack e riprova." }

    if ($Restore) {
        if ([string]::IsNullOrWhiteSpace($File)) { throw "In ripristino serve -File con l'archivio da caricare." }
        if (-not (Test-Path -LiteralPath $File)) { throw "Archivio non trovato: $File" }

        Write-Host "Sto per SOVRASCRIVERE il database attuale con:" -ForegroundColor Yellow
        Write-Host "  $File" -ForegroundColor Yellow
        Write-Host "Il personaggio e i progressi attuali andranno persi." -ForegroundColor Yellow
        $risposta = Read-Host "Scrivi RIPRISTINA per confermare"
        if ($risposta -ne 'RIPRISTINA') { Write-Host 'Annullato.'; return }

        docker cp $File "${cid}:/tmp/restore.gz" | Out-Null
        docker compose -f $COMPOSE exec -T mongo mongorestore --username=root --password=$pw --authenticationDatabase=admin --archive=/tmp/restore.gz --gzip --drop --quiet
        Write-Host "`nRipristinato. Riavvio il server per farglielo rileggere..." -ForegroundColor Green
        docker compose -f $COMPOSE restart server | Out-Null
        Write-Host "Fatto. Chiudi e riapri il gioco." -ForegroundColor Green
        return
    }

    # --- backup ---
    if (-not (Test-Path -LiteralPath $DEST_DIR)) { New-Item -ItemType Directory -Path $DEST_DIR -Force | Out-Null }
    if ([string]::IsNullOrWhiteSpace($File)) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
        $File = Join-Path $DEST_DIR "apypos-$stamp.gz"
    }

    docker compose -f $COMPOSE exec -T mongo mongodump --username=root --password=$pw --authenticationDatabase=admin --db=apypos --archive=/tmp/backup.gz --gzip --quiet
    docker cp "${cid}:/tmp/backup.gz" $File | Out-Null

    $item = Get-Item -LiteralPath $File
    Write-Host "Backup creato:" -ForegroundColor Green
    Write-Host "  $($item.FullName)"
    Write-Host "  $([Math]::Round($item.Length / 1KB)) KB"

    # controllo di sanita': un dump troppo piccolo e' un dump vuoto
    if ($item.Length -lt 50KB) {
        Write-Warning "L'archivio e' sospettosamente piccolo: controlla che il database non sia vuoto."
    }

    Write-Host "`nArchivi presenti:" -ForegroundColor DarkGray
    Get-ChildItem -LiteralPath $DEST_DIR -Filter *.gz | Sort-Object LastWriteTime -Descending |
        Select-Object -First 8 |
        ForEach-Object { "  {0,-34} {1,6} KB   {2}" -f $_.Name, [Math]::Round($_.Length / 1KB), $_.LastWriteTime.ToString('dd/MM HH:mm') }
}
finally {
    Pop-Location
}
