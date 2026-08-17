<#
.SYNOPSIS
    Patcha l'URL di dispatch dentro le libMHS.so di MHXR, senza editor esadecimale.

.DESCRIPTION
    All'avvio il gioco contatta un solo indirizzo "hardcoded" nel codice nativo:
    la dispatch URL (in origine https://mhxr-dispatch.s3-ap-northeast-1.amazonaws.com/).
    Da quella risposta ricava dinamicamente tutti gli altri indirizzi (api, res, web,
    server multiplayer), che il server Apypos genera dal proprio .env.

    Quindi basta patchare QUESTA stringa, in ENTRAMBE le architetture, e mettendoci
    un NOME DI DOMINIO invece di un IP non serve piu' ritoccare l'apk quando l'IP cambia.

    Lo slot della stringa nel binario ha dimensione fissa: non si puo' allungare.
    Lo script calcola lo spazio realmente disponibile (stringa + byte NUL che la
    seguono, fermandosi al primo byte di dati veri) e si rifiuta di sforare.

.PARAMETER ApkDir
    Cartella dell'apk scompattata con apktool (quella che contiene AndroidManifest.xml e lib\).

.PARAMETER Url
    Nuovo URL. Deve essere http:// (il gioco non fa TLS verso il server privato) e
    finire con /. Esempio: http://mhxr.duckdns.org/

.PARAMETER Restore
    Ripristina le librerie dai backup .bak invece di patchare.

.EXAMPLE
    .\Patch-MhxrUrl.ps1 -ApkDir "D:\MHXR_ServerHack\Monster Hunter XR\Resources Files Games\MHXR_base" -Url "http://mhxr.duckdns.org/"

.EXAMPLE
    .\Patch-MhxrUrl.ps1 -ApkDir "...\MHXR_base" -Restore
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$ApkDir,

    [Parameter(Mandatory = $false)]
    [string]$Url,

    [switch]$Restore
)

$ErrorActionPreference = 'Stop'

# Stringa originale Capcom, presente nelle lib mai toccate.
$ORIGINAL_URL = 'https://mhxr-dispatch.s3-ap-northeast-1.amazonaws.com/'
# Simbolo che nel .rodata segue sempre lo slot: serve a ritrovarlo se e' gia' stato patchato.
$ANCHOR       = 'nNetwork::MHiSession'
# Quanto indietro cercare a partire dall'ancora.
$WINDOW       = 4096

$LATIN1 = [System.Text.Encoding]::GetEncoding(28591)

$ARCHS = @('arm64-v8a', 'armeabi-v7a')


function Get-UrlSlot {
    <#
      Individua lo slot della dispatch URL e ne misura lo spazio utilizzabile.
      Ritorna $null se non lo trova.
    #>
    param([string]$Text)

    $start = -1

    # 1) lib vergine: cerco la stringa Capcom originale
    $idx = $Text.IndexOf($ORIGINAL_URL, [System.StringComparison]::Ordinal)
    if ($idx -ge 0) {
        $start = $idx
    }
    else {
        # 2) lib gia' patchata: cerco l'ultimo http(s):// che precede l'ancora
        $rx = [regex]'(?<=\x00)https?://[\x20-\x7E]*(?=\x00)'
        $anchorIdx = 0
        while (($anchorIdx = $Text.IndexOf($ANCHOR, $anchorIdx, [System.StringComparison]::Ordinal)) -ge 0) {
            $from = [Math]::Max(0, $anchorIdx - $WINDOW)
            $window = $Text.Substring($from, $anchorIdx - $from)
            $matches = $rx.Matches($window)
            if ($matches.Count -gt 0) {
                $start = $from + $matches[$matches.Count - 1].Index
                break
            }
            $anchorIdx += $ANCHOR.Length
        }
    }

    if ($start -lt 0) { return $null }

    # fine stringa
    $end = $Text.IndexOf([char]0, $start)
    if ($end -lt 0) { return $null }
    $current = $Text.Substring($start, $end - $start)

    # lo slot arriva fino al primo byte NON nullo dopo il terminatore:
    # oltre quel punto ci sono dati veri (puntatori, float, altre stringhe)
    $k = $end
    while ($k -lt $Text.Length -and $Text[$k] -eq [char]0) { $k++ }
    $slotSize = $k - $start

    return [pscustomobject]@{
        Start    = $start
        Current  = $current
        SlotSize = $slotSize      # byte totali scrivibili, terminatore incluso
        MaxChars = $slotSize - 1  # caratteri utilizzabili
    }
}


# ---------------------------------------------------------------- validazioni

if (-not (Test-Path -LiteralPath $ApkDir -PathType Container)) {
    throw "Cartella non trovata: $ApkDir"
}
if (-not (Test-Path -LiteralPath (Join-Path $ApkDir 'AndroidManifest.xml'))) {
    throw "$ApkDir non sembra un apk scompattato: manca AndroidManifest.xml"
}

if (-not $Restore) {
    if ([string]::IsNullOrWhiteSpace($Url)) {
        throw "Serve -Url (oppure usa -Restore). Esempio: -Url 'http://mhxr.duckdns.org/'"
    }
    if ($Url -notmatch '^http://') {
        Write-Warning "L'URL non inizia con http:// . Il gioco parla in chiaro con il server privato: https quasi sicuramente non funziona."
    }
    if ($Url -notmatch '/$') {
        Write-Warning "L'URL non finisce con / . L'originale Capcom finiva con / : ti conviene tenerlo."
    }
    if ($Url -match '[^\x20-\x7E]') {
        throw "L'URL contiene caratteri non ASCII."
    }
}


# ---------------------------------------------------------------- ripristino

if ($Restore) {
    $done = 0
    foreach ($arch in $ARCHS) {
        $lib = Join-Path $ApkDir "lib\$arch\libMHS.so"
        $bak = "$lib.bak"
        if (-not (Test-Path -LiteralPath $bak)) {
            Write-Host "[$arch] nessun backup, salto." -ForegroundColor DarkGray
            continue
        }
        if ($PSCmdlet.ShouldProcess($lib, "ripristina da .bak")) {
            Copy-Item -LiteralPath $bak -Destination $lib -Force
            Write-Host "[$arch] ripristinata da $([System.IO.Path]::GetFileName($bak))" -ForegroundColor Green
            $done++
        }
    }
    Write-Host "`nRipristinate $done librerie." -ForegroundColor Cyan
    return
}


# ---------------------------------------------------------------- patch
#
# Due fasi separate, di proposito. Patchare una sola architettura e' peggio che non
# patchare affatto: il gioco carica la arm64 sui telefoni a 64 bit e la v7a sugli
# emulatori, e un disallineamento fra le due produce un bug che sembra casuale.
# Quindi prima si analizzano e validano TUTTE, e solo se passano tutte si scrive.

# --- fase 1: analisi ---

$plans = @()

foreach ($arch in $ARCHS) {
    $lib = Join-Path $ApkDir "lib\$arch\libMHS.so"

    if (-not (Test-Path -LiteralPath $lib)) {
        throw "[$arch] libMHS.so non trovata in $lib . Non patcho niente: servono entrambe le architetture."
    }

    Write-Host "`n=== $arch ===" -ForegroundColor Cyan
    Write-Host "  lettura $([Math]::Round((Get-Item -LiteralPath $lib).Length / 1MB, 1)) MB..."

    $bytes = [System.IO.File]::ReadAllBytes($lib)
    $text  = $LATIN1.GetString($bytes)

    $slot = Get-UrlSlot -Text $text
    if ($null -eq $slot) {
        throw "[$arch] slot della dispatch URL non individuato. Non patcho niente. La libreria e' quella giusta?"
    }

    Write-Host ("  offset          : {0} (0x{0:X})" -f $slot.Start)
    Write-Host ("  valore attuale  : {0}" -f $slot.Current)
    Write-Host ("  spazio slot     : {0} byte -> max {1} caratteri" -f $slot.SlotSize, $slot.MaxChars)

    $plans += [pscustomobject]@{
        Arch  = $arch
        Lib   = $lib
        Bytes = $bytes
        Slot  = $slot
    }
}

# --- fase 2: validazione complessiva ---

Write-Host "`n=== verifica ===" -ForegroundColor Cyan
Write-Host ("  nuovo valore    : {0} ({1} caratteri)" -f $Url, $Url.Length)

# NB: niente "Measure-Object -Property { ... }", le property scriptblock
# esistono solo da PowerShell 6 in su e qui gira spesso la 5.1.
$minChars = ($plans | ForEach-Object { $_.Slot.MaxChars } | Measure-Object -Minimum).Minimum
$tooSmall = @($plans | Where-Object { $Url.Length -gt $_.Slot.MaxChars })

if ($tooSmall.Count -gt 0) {
    Write-Host ""
    foreach ($p in $tooSmall) {
        Write-Warning ("[{0}] non ci sta: servono {1} caratteri, ce ne stanno {2}." -f $p.Arch, $Url.Length, $p.Slot.MaxChars)
    }
    throw ("URL troppo lungo. Il limite e' imposto dalla libreria piu' stretta: max $minChars caratteri, " +
           "'$Url' ne ha $($Url.Length). Nessun file e' stato modificato. Accorcia l'hostname " +
           "(es. 'mhxr.duckdns.org' invece di qualcosa di piu' lungo) e riprova.")
}

Write-Host ("  limite reale    : {0} caratteri (imposto dalla lib piu' stretta) -> OK" -f $minChars) -ForegroundColor Green

# --- fase 3: scrittura ---

$results = @()

foreach ($p in $plans) {
    $arch = $p.Arch
    $lib  = $p.Lib
    $slot = $p.Slot

    if ($slot.Current -eq $Url) {
        Write-Host "[$arch] gia' patchata con questo valore, salto." -ForegroundColor DarkGray
        $results += [pscustomobject]@{ Arch = $arch; Esito = 'gia-ok'; Valore = $Url }
        continue
    }

    if (-not $PSCmdlet.ShouldProcess($lib, "scrivi '$Url' a offset $($slot.Start)")) { continue }

    # backup una tantum: conserva SEMPRE lo stato piu' vecchio
    $bak = "$lib.bak"
    if (-not (Test-Path -LiteralPath $bak)) {
        Copy-Item -LiteralPath $lib -Destination $bak
        Write-Host "[$arch] backup creato: $([System.IO.Path]::GetFileName($bak))" -ForegroundColor DarkGray
    }
    else {
        Write-Host "[$arch] backup gia' presente, non lo sovrascrivo." -ForegroundColor DarkGray
    }

    # azzero tutto lo slot, poi scrivo il nuovo URL
    $bytes = $p.Bytes
    for ($i = 0; $i -lt $slot.SlotSize; $i++) { $bytes[$slot.Start + $i] = 0 }
    $urlBytes = $LATIN1.GetBytes($Url)
    [Array]::Copy($urlBytes, 0, $bytes, $slot.Start, $urlBytes.Length)

    [System.IO.File]::WriteAllBytes($lib, $bytes)

    # verifica rileggendo dal disco
    $check     = [System.IO.File]::ReadAllBytes($lib)
    $checkText = $LATIN1.GetString($check)
    $end       = $checkText.IndexOf([char]0, $slot.Start)
    $written   = $checkText.Substring($slot.Start, $end - $slot.Start)

    if ($written -eq $Url) {
        Write-Host "[$arch] OK, verificata." -ForegroundColor Green
        $results += [pscustomobject]@{ Arch = $arch; Esito = 'patchata'; Valore = $written }
    }
    else {
        Write-Warning "[$arch] VERIFICA FALLITA: sul disco c'e' '$written'. Ripristina con -Restore."
        $results += [pscustomobject]@{ Arch = $arch; Esito = 'ERRORE'; Valore = $written }
    }
}

Write-Host "`n--- riepilogo ---" -ForegroundColor Cyan
$results | Format-Table -AutoSize

$ok = @($results | Where-Object { $_.Esito -in @('patchata', 'gia-ok') }).Count
if ($ok -lt $ARCHS.Count) {
    Write-Warning "Solo $ok librerie su $($ARCHS.Count) sono a posto: NON ricostruire l'apk cosi'."
    Write-Warning "Un disallineamento fra arm64 e v7a fa partire il gioco sull'emulatore ma non sul telefono."
}
else {
    Write-Host @"

Fatto. Adesso:

  apktool.bat b -o mhxr-jp.apk MHXR_base
  java -jar uber-apk-signer-1.3.0.jar -a "mhxr-jp.apk" -out ./out

Finche' il dominio resta lo stesso, questi due passaggi non li rifarai mai piu':
quando cambia l'IP aggiorni il DNS e riavvii il server.
"@ -ForegroundColor Green
}
