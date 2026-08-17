<#
.SYNOPSIS
    Tiene allineato un dominio DuckDNS all'IP di questo PC, pubblico o locale.

.DESCRIPTION
    Risolve il problema originale: quando l'IP cambia, il dominio lo segue da solo e
    l'apk di MHXR resta valida. Nessuna ricompilazione, nessuna nuova firma.

    Due modalita':

      -UseLocalIp   punta il dominio all'IP LAN del PC (es. 192.168.1.58).
                    Per giocare dal telefono sul WiFi di casa: nessuna porta da
                    aprire sul router, nessun problema di CGNAT. DuckDNS accetta
                    anche gli indirizzi privati.

      (default)     punta il dominio all'IP pubblico della linea.
                    Serve per far giocare gli amici da fuori, e richiede una port
                    forward della porta 80 sul router verso questo PC.

    Passare da una modalita' all'altra e' solo un aggiornamento DNS: l'apk NON si
    ritocca. E' esattamente il motivo per cui abbiamo messo un dominio al posto
    dell'IP dentro la libreria.

    Con -Install crea un'operazione pianificata che gira ogni 5 minuti e a ogni avvio
    del PC. Non serve tenere il computer sempre accesso: quando lo riaccendi, entro
    pochi minuti il dominio torna allineato.

    Il token viene salvato cifrato con DPAPI, leggibile solo dal tuo utente su questo PC.

.PARAMETER Domain
    Solo il nome, senza ".duckdns.org". Esempio: mhxr

.PARAMETER Token
    Il token che trovi in alto su duckdns.org dopo il login.
    Serve la prima volta o con -Install: poi viene riletto dal file cifrato.

.PARAMETER UseLocalIp
    Pubblica l'IP LAN invece di quello pubblico.

.PARAMETER Install
    Registra l'operazione pianificata.

.PARAMETER Uninstall
    Rimuove l'operazione pianificata.

.PARAMETER Status
    Mostra IP corrente, IP registrato su DuckDNS, stato dell'operazione e ultimi log.

.EXAMPLE
    .\Update-DuckDns.ps1 -Domain mhxr -Token 1234-abcd -UseLocalIp -Install

.EXAMPLE
    .\Update-DuckDns.ps1 -Status
#>
[CmdletBinding(DefaultParameterSetName = 'Update')]
param(
    # Non obbligatori su -Install: se una configurazione esiste gia' vengono
    # riletti da li', cosi' non devi ripescare il token per rilanciare.
    [Parameter(ParameterSetName = 'Update')]
    [Parameter(ParameterSetName = 'Install')]
    [string]$Domain,

    [Parameter(ParameterSetName = 'Update')]
    [Parameter(ParameterSetName = 'Install')]
    [string]$Token,

    [Parameter(ParameterSetName = 'Update')]
    [Parameter(ParameterSetName = 'Install')]
    [switch]$UseLocalIp,

    [Parameter(ParameterSetName = 'Install', Mandatory = $true)]
    [switch]$Install,

    [Parameter(ParameterSetName = 'Uninstall', Mandatory = $true)]
    [switch]$Uninstall,

    [Parameter(ParameterSetName = 'Status', Mandatory = $true)]
    [switch]$Status
)

$ErrorActionPreference = 'Stop'

$TASK_NAME = 'MHXR-DuckDNS'
$CONF_DIR  = Join-Path $env:LOCALAPPDATA 'mhxr-duckdns'
$CONF_FILE = Join-Path $CONF_DIR 'config.xml'
$LOG_FILE  = Join-Path $CONF_DIR 'update.log'

# TLS 1.2 esplicito: su Windows PowerShell 5.1 il default e' ancora TLS 1.0
# e duckdns.org rifiuta la connessione.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12


function Write-Log {
    param([string]$Message)
    if (-not (Test-Path -LiteralPath $CONF_DIR)) {
        New-Item -ItemType Directory -Path $CONF_DIR -Force | Out-Null
    }
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -LiteralPath $LOG_FILE -Value $line -Encoding UTF8

    # il log va tenuto corto: questo task gira ogni 5 minuti per anni
    if ((Get-Item -LiteralPath $LOG_FILE).Length -gt 256KB) {
        $keep = Get-Content -LiteralPath $LOG_FILE -Tail 500
        Set-Content -LiteralPath $LOG_FILE -Value $keep -Encoding UTF8
    }
    Write-Verbose $Message
}

function Save-Config {
    param([string]$Domain, [string]$Token, [string]$Mode)
    if (-not (Test-Path -LiteralPath $CONF_DIR)) {
        New-Item -ItemType Directory -Path $CONF_DIR -Force | Out-Null
    }
    # DPAPI: decifrabile solo da questo utente su questa macchina
    $secure = ConvertTo-SecureString $Token -AsPlainText -Force
    [pscustomobject]@{
        Domain = $Domain
        Token  = ConvertFrom-SecureString $secure
        Mode   = $Mode
    } | Export-Clixml -LiteralPath $CONF_FILE
}

function Read-Config {
    if (-not (Test-Path -LiteralPath $CONF_FILE)) {
        throw "Configurazione non trovata. Lancia prima lo script con -Domain e -Token."
    }
    $c = Import-Clixml -LiteralPath $CONF_FILE
    $secure = ConvertTo-SecureString $c.Token
    $bstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try   { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

    $mode = $c.Mode
    if ([string]::IsNullOrWhiteSpace($mode)) { $mode = 'public' }

    return [pscustomobject]@{ Domain = $c.Domain; Token = $plain; Mode = $mode }
}

function Get-PublicIp {
    # piu' fonti: se una e' giu' o applica rate limit, si prosegue
    foreach ($u in @('https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com')) {
        try {
            $ip = (Invoke-RestMethod -Uri $u -TimeoutSec 10).ToString().Trim()
            if ($ip -match '^(\d{1,3}\.){3}\d{1,3}$') { return $ip }
        }
        catch { }
    }
    return $null
}

function Get-LocalIp {
    # l'IP della scheda che porta davvero su internet, non la prima della lista:
    # su un PC con WiFi + ethernet + adattatori virtuali (WSL, Docker, VPN)
    # sceglierne una a caso e' il modo classico di sbagliare
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
             Sort-Object -Property RouteMetric, ifMetric |
             Select-Object -First 1
    if ($null -eq $route) { return $null }

    $addr = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.ifIndex -ErrorAction SilentlyContinue |
            Where-Object { $_.IPAddress -notlike '169.254.*' } |
            Select-Object -First 1
    if ($null -eq $addr) { return $null }
    return $addr.IPAddress
}

function Get-TargetIp {
    param([string]$Mode)
    if ($Mode -eq 'local') { return Get-LocalIp }
    return Get-PublicIp
}


# ------------------------------------------------------------------ disinstalla

if ($Uninstall) {
    if ($null -eq (Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue)) {
        Write-Host "L'operazione '$TASK_NAME' non esiste." -ForegroundColor DarkGray
    }
    else {
        Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false
        Write-Host "Operazione '$TASK_NAME' rimossa." -ForegroundColor Green
    }
    Write-Host "La configurazione in $CONF_DIR resta: cancellala a mano se vuoi." -ForegroundColor DarkGray
    return
}


# ------------------------------------------------------------------ stato

if ($Status) {
    Write-Host "=== DuckDNS - stato ===" -ForegroundColor Cyan

    $c = $null
    try {
        $c = Read-Config
        Write-Host "  dominio        : $($c.Domain).duckdns.org"
        if ($c.Mode -eq 'local') {
            Write-Host "  modalita'      : IP LOCALE (gioco dal WiFi di casa)"
        }
        else {
            Write-Host "  modalita'      : IP PUBBLICO (serve port forward sulla 80)"
        }
    }
    catch {
        Write-Host "  dominio        : non configurato" -ForegroundColor Yellow
    }

    Write-Host "  IP locale      : $(Get-LocalIp)"
    $pub = Get-PublicIp
    if ($pub) { Write-Host "  IP pubblico    : $pub" }
    else      { Write-Host "  IP pubblico    : non rilevabile (offline?)" -ForegroundColor Yellow }

    if ($c) {
        $target = Get-TargetIp -Mode $c.Mode
        try {
            $res = Resolve-DnsName -Name "$($c.Domain).duckdns.org" -Type A -DnsOnly -ErrorAction Stop
            $dns = ($res | Where-Object { $_.Type -eq 'A' } | Select-Object -First 1).IPAddress
            Write-Host "  IP su DuckDNS  : $dns"
            if ($target -and $dns) {
                if ($dns -eq $target) {
                    Write-Host "  allineato      : SI" -ForegroundColor Green
                }
                else {
                    Write-Host "  allineato      : NO (atteso $target) - il task non gira, o e' appena cambiato" -ForegroundColor Yellow
                }
            }
        }
        catch {
            Write-Host "  IP su DuckDNS  : non risolvibile" -ForegroundColor Yellow
        }
    }

    if (Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue) {
        $info = Get-ScheduledTaskInfo -TaskName $TASK_NAME
        Write-Host "  operazione     : installata"
        Write-Host "  ultima esec.   : $($info.LastRunTime)  (esito $($info.LastTaskResult))"
        Write-Host "  prossima       : $($info.NextRunTime)"
    }
    else {
        Write-Host "  operazione     : non installata" -ForegroundColor Yellow
    }

    if (Test-Path -LiteralPath $LOG_FILE) {
        Write-Host "`n  ultime righe di log:" -ForegroundColor DarkGray
        Get-Content -LiteralPath $LOG_FILE -Tail 8 | ForEach-Object { "    $_" }
    }
    return
}


# ------------------------------------------------------------------ modalita'

if ($UseLocalIp) { $mode = 'local' } else { $mode = 'public' }


# ------------------------------------------------------------------ installa

if ($Install) {
    # Se dominio o token mancano, li recupero dalla configurazione esistente.
    if (-not $Domain -or -not $Token) {
        try {
            $prev = Read-Config
            if (-not $Domain) { $Domain = $prev.Domain }
            if (-not $Token)  { $Token  = $prev.Token }
            Write-Host "Riuso dominio e token gia' salvati." -ForegroundColor DarkGray
        }
        catch {
            throw "La prima volta servono sia -Domain sia -Token."
        }
    }

    Save-Config -Domain $Domain -Token $Token -Mode $mode
    Write-Host "Configurazione salvata (cifrata) in $CONF_FILE" -ForegroundColor DarkGray

    $me = $MyInvocation.MyCommand.Path
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$me`""

    # Ogni 5 minuti, piu' una all'avvio: dopo un riavvio o un cambio IP notturno
    # il dominio si riallinea da solo.
    #
    # NB: NON usare [TimeSpan]::MaxValue per dire "per sempre". Genera
    # P99999999DT23H59M59S e l'Utilita' di pianificazione lo rifiuta come fuori
    # range (HRESULT 0x80041318). 10 anni sono validi e in pratica equivalenti.
    $tRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date) `
        -RepetitionInterval (New-TimeSpan -Minutes 5) `
        -RepetitionDuration (New-TimeSpan -Days 3650)
    $tBoot = New-ScheduledTaskTrigger -AtStartup

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

    # Principal esplicito, e non e' un dettaglio: la registrazione richiede un
    # prompt da amministratore, ma l'operazione deve girare come UTENTE NORMALE.
    # Il token e' cifrato con DPAPI legato a questo account: se il task partisse
    # come SYSTEM non riuscirebbe a decifrarlo e fallirebbe a ogni esecuzione.
    # RunLevel Limited = non elevato, che e' giusto: lo script non ne ha bisogno.
    # Uso il SID e non "DOMINIO\utente": questo PC e' aggiunto ad Azure AD e
    # l'utente risulta "AzureAD\Nome", formato con cui l'Utilita' di
    # pianificazione a volte fa storie. Il SID lo accetta sempre.
    $sid = ([System.Security.Principal.WindowsIdentity]::GetCurrent()).User.Value
    $principal = New-ScheduledTaskPrincipal `
        -UserId $sid `
        -LogonType Interactive -RunLevel Limited

    if (Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false
    }

    try {
        Register-ScheduledTask -TaskName $TASK_NAME `
            -Action $action -Trigger @($tRepeat, $tBoot) -Settings $settings `
            -Principal $principal -ErrorAction Stop `
            -Description 'Allinea il dominio DuckDNS di MHXR all IP corrente di questo PC' | Out-Null
    }
    catch {
        if ("$($_.Exception.Message)" -match 'Access is denied|Accesso negato') {
            throw ("Permessi insufficienti per creare l'operazione pianificata.`n" +
                   "Riapri PowerShell COME AMMINISTRATORE (tasto destro sul menu Start ->`n" +
                   "'Terminale (amministratore)') e rilancia lo stesso comando.`n" +
                   "La configurazione e' gia' salvata, quindi puoi ometter -Domain e -Token.")
        }
        throw
    }

    Write-Host "Operazione pianificata '$TASK_NAME' creata (ogni 5 minuti + a ogni avvio)." -ForegroundColor Green
    Write-Host "Eseguo subito il primo aggiornamento...`n" -ForegroundColor DarkGray
}


# ------------------------------------------------------------------ aggiorna

if ($Domain -and $Token -and -not $Install) {
    Save-Config -Domain $Domain -Token $Token -Mode $mode
}

$cfg = Read-Config
$ip  = Get-TargetIp -Mode $cfg.Mode

if ($null -eq $ip) {
    Write-Log "IP ($($cfg.Mode)) non rilevabile, salto."
    Write-Warning "Non riesco a determinare l'IP in modalita' '$($cfg.Mode)'. Sei connesso?"
    exit 1
}

# Passo l'IP esplicito: senza il parametro DuckDNS usa quello da cui arriva la
# richiesta, che in modalita' locale sarebbe sbagliato (sarebbe il pubblico).
$url = "https://www.duckdns.org/update?domains=$($cfg.Domain)&token=$($cfg.Token)&ip=$ip"

try {
    $resp = (Invoke-RestMethod -Uri $url -TimeoutSec 20).ToString().Trim()
}
catch {
    Write-Log "ERRORE chiamando DuckDNS: $($_.Exception.Message)"
    Write-Warning "Chiamata a DuckDNS fallita: $($_.Exception.Message)"
    exit 1
}

if ($resp -eq 'OK') {
    Write-Log "OK  [$($cfg.Mode)]  $($cfg.Domain).duckdns.org -> $ip"
    Write-Host "OK: $($cfg.Domain).duckdns.org punta a $ip  [modalita' $($cfg.Mode)]" -ForegroundColor Green
}
else {
    # DuckDNS risponde solo "KO", senza spiegazioni: quasi sempre token o dominio sbagliati
    Write-Log "KO  risposta '$resp' per dominio '$($cfg.Domain)'"
    Write-Warning "DuckDNS ha risposto '$resp'. Controlla dominio e token (il dominio va scritto SENZA .duckdns.org)."
    exit 1
}
