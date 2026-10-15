# Servidor HTTP Local em PowerShell Nativo para Distrito Paulista RP
# Uso: powershell -ExecutionPolicy Bypass -File .\serve.ps1
param([int]$Port = 5500)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
if (-not $Root) { $Root = Get-Location }

$Listener = New-Object System.Net.HttpListener
$Prefix = "http://localhost:$Port/"
$Listener.Prefixes.Add($Prefix)

try {
    $Listener.Start()
    Write-Host "==========================================================" -ForegroundColor Yellow
    Write-Host " [DISTRITO PAULISTA RP] Servidor Local Iniciado com Sucesso" -ForegroundColor Green
    Write-Host " URL de Acesso: $Prefix" -ForegroundColor Cyan
    Write-Host " Pressione Ctrl+C para encerrar o servidor." -ForegroundColor Gray
    Write-Host "==========================================================" -ForegroundColor Yellow

    $MimeTypes = @{
        ".html" = "text/html; charset=utf-8"
        ".css"  = "text/css; charset=utf-8"
        ".js"   = "application/javascript; charset=utf-8"
        ".mjs"  = "application/javascript; charset=utf-8"
        ".png"  = "image/png"
        ".jpg"  = "image/jpeg"
        ".jpeg" = "image/jpeg"
        ".svg"  = "image/svg+xml"
        ".json" = "application/json; charset=utf-8"
        ".sql"  = "text/plain; charset=utf-8"
        ".ico"  = "image/x-icon"
    }

    while ($Listener.IsListening) {
        $Context = $Listener.GetContext()
        $Request = $Context.Request
        $Response = $Context.Response

        $UrlPath = $Request.Url.LocalPath.TrimStart('/')
        # CORS Preflight
        if ($Request.HttpMethod -eq "OPTIONS") {
            $Response.StatusCode = 200
            $Response.AddHeader("Access-Control-Allow-Origin", "*")
            $Response.AddHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
            $Response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
            $Response.Close()
            continue
        }

        # Endpoint de status em tempo real do FiveM (Proxy sem CORS)
        if ($UrlPath -eq "api/fivem-status") {
            $Response.ContentType = "application/json; charset=utf-8"
            $Response.AddHeader("Access-Control-Allow-Origin", "*")
            $Response.AddHeader("Cache-Control", "no-cache")

            $StatusJson = '{"online":false,"clients":0,"maxClients":128}'
            try {
                $FiveM = Invoke-RestMethod -Uri "http://distritopaulistarp.fivebr.gg:30120/dynamic.json" -TimeoutSec 3 -ErrorAction Stop
                $Clients = [int]$FiveM.clients
                $Max = [int]$FiveM.sv_maxclients
                if ($Max -le 0) { $Max = 128 }
                $StatusJson = (@{
                    online = $true
                    clients = $Clients
                    maxClients = $Max
                    hostname = $FiveM.hostname
                    gametype = $FiveM.gametype
                } | ConvertTo-Json)
            } catch {
                # Fallback se a porta não responder momentaneamente
                $StatusJson = '{"online":true,"clients":0,"maxClients":128,"fallback":true}'
            }

            $Buffer = [System.Text.Encoding]::UTF8.GetBytes($StatusJson)
            $Response.ContentLength64 = $Buffer.Length
            $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
            $Response.Close()
            continue
        }

        # Endpoint de Candidaturas (APPLICATIONS)
        if ($UrlPath -eq "api/applications") {
            $Response.ContentType = "application/json; charset=utf-8"
            $Response.AddHeader("Access-Control-Allow-Origin", "*")
            $Response.AddHeader("Cache-Control", "no-cache")
            $DataPath = Join-Path $Root "data\applications.json"

            if ($Request.HttpMethod -eq "GET") {
                $Content = if (Test-Path $DataPath) { [System.IO.File]::ReadAllText($DataPath, [System.Text.Encoding]::UTF8) } else { "[]" }
                $Buffer = [System.Text.Encoding]::UTF8.GetBytes($Content)
                $Response.ContentLength64 = $Buffer.Length
                $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
                $Response.Close()
                continue
            }

            if ($Request.HttpMethod -eq "POST") {
                $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                $RawBody = $Reader.ReadToEnd()
                $Body = $RawBody | ConvertFrom-Json
                $Existing = @()
                if (Test-Path $DataPath) {
                    $RawExisting = [System.IO.File]::ReadAllText($DataPath, [System.Text.Encoding]::UTF8)
                    try { $Existing = @($RawExisting | ConvertFrom-Json) } catch {}
                }
                $NewApp = [PSCustomObject]@{
                    id = if ($Body.id) { $Body.id } else { "app-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
                    game_name = $Body.game_name
                    discord_tag = $Body.discord_tag
                    age = [int]$Body.age
                    desired_role = if ($Body.desired_role) { $Body.desired_role } else { "suporte" }
                    availability = if ($Body.availability) { $Body.availability } else { "" }
                    experience = if ($Body.experience) { $Body.experience } else { "" }
                    scenario1 = if ($Body.scenario1) { $Body.scenario1 } else { "" }
                    scenario2 = if ($Body.scenario2) { $Body.scenario2 } else { "" }
                    motivation = if ($Body.motivation) { $Body.motivation } else { "" }
                    answers = $Body.answers
                    status = "pending"
                    reviewer = $null
                    reviewed_at = $null
                    created_at = (Get-Date).ToString("o")
                }
                $All = @($NewApp) + $Existing
                $Json = $All | ConvertTo-Json -Depth 10
                [System.IO.File]::WriteAllText($DataPath, $Json, [System.Text.Encoding]::UTF8)
                $Response.StatusCode = 201
                $ResBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                $Response.ContentLength64 = $ResBytes.Length
                $Response.OutputStream.Write($ResBytes, 0, $ResBytes.Length)
                $Response.Close()
                continue
            }

            if ($Request.HttpMethod -eq "PATCH") {
                $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                $Body = $Reader.ReadToEnd() | ConvertFrom-Json
                $Existing = @()
                if (Test-Path $DataPath) {
                    $RawExisting = [System.IO.File]::ReadAllText($DataPath, [System.Text.Encoding]::UTF8)
                    try { $Existing = @($RawExisting | ConvertFrom-Json) } catch {}
                }
                foreach ($item in $Existing) {
                    if ($item.id -eq $Body.id) {
                        if ($Body.status) { $item.status = $Body.status }
                        if ($Body.reviewer) { $item.reviewer = $Body.reviewer }
                        if ($Body.review_date) { $item.reviewed_at = $Body.review_date }
                        if ($Body.reviewed_at) { $item.reviewed_at = $Body.reviewed_at }
                    }
                }
                [System.IO.File]::WriteAllText($DataPath, ($Existing | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
                $Response.StatusCode = 200
                $ResBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                $Response.ContentLength64 = $ResBytes.Length
                $Response.OutputStream.Write($ResBytes, 0, $ResBytes.Length)
                $Response.Close()
                continue
            }

            if ($Request.HttpMethod -eq "DELETE") {
                $DelId = $Request.QueryString["id"]
                if (-not $DelId) {
                    $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                    $Body = $Reader.ReadToEnd() | ConvertFrom-Json
                    $DelId = $Body.id
                }
                $Existing = @()
                if (Test-Path $DataPath) {
                    $RawExisting = [System.IO.File]::ReadAllText($DataPath, [System.Text.Encoding]::UTF8)
                    try { $Existing = @($RawExisting | ConvertFrom-Json) } catch {}
                }
                $Filtered = @($Existing | Where-Object { $_.id -ne $DelId })
                [System.IO.File]::WriteAllText($DataPath, ($Filtered | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
                $Response.StatusCode = 200
                $ResBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                $Response.ContentLength64 = $ResBytes.Length
                $Response.OutputStream.Write($ResBytes, 0, $ResBytes.Length)
                $Response.Close()
                continue
            }
        }

        # Endpoint de Consulta de Candidatura (CHECK)
        if ($UrlPath -eq "api/applications/check") {
            $Response.ContentType = "application/json; charset=utf-8"
            $Response.AddHeader("Access-Control-Allow-Origin", "*")
            $Response.AddHeader("Cache-Control", "no-cache")
            $DataPath = Join-Path $Root "data\applications.json"
            $Q = ($Request.QueryString["q"] + "").Trim().ToLower().Replace("#", "")
            $Existing = @()
            if (Test-Path $DataPath) {
                $RawExisting = [System.IO.File]::ReadAllText($DataPath, [System.Text.Encoding]::UTF8)
                try { $Existing = @($RawExisting | ConvertFrom-Json) } catch {}
            }
            $Matched = $Existing | Where-Object {
                $dTag = (($_.discord_tag + "").ToLower().Replace("#", ""))
                $gName = ($_.game_name + "").ToLower()
                return ($dTag -eq $Q -or $dTag.Contains($Q) -or $gName.Contains($Q))
            } | Select-Object -First 1

            if ($Matched) {
                $Response.StatusCode = 200
                $ResObj = [PSCustomObject]@{ ok = $true; application = $Matched }
                $ResBytes = [System.Text.Encoding]::UTF8.GetBytes(($ResObj | ConvertTo-Json -Depth 10))
            } else {
                $Response.StatusCode = 404
                $ResBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"message":"Nenhuma candidatura encontrada."}')
            }
            $Response.ContentLength64 = $ResBytes.Length
            $Response.OutputStream.Write($ResBytes, 0, $ResBytes.Length)
            $Response.Close()
            continue
        }

        # Endpoint de Equipe Staff (TEAM)
        if ($UrlPath -eq "api/team") {
            $Response.ContentType = "application/json; charset=utf-8"
            $Response.AddHeader("Access-Control-Allow-Origin", "*")
            $Response.AddHeader("Cache-Control", "no-cache")
            $TeamPath = Join-Path $Root "data\team.json"

            if ($Request.HttpMethod -eq "GET") {
                $Content = if (Test-Path $TeamPath) { [System.IO.File]::ReadAllText($TeamPath, [System.Text.Encoding]::UTF8) } else { "[]" }
                $Buffer = [System.Text.Encoding]::UTF8.GetBytes($Content)
                $Response.ContentLength64 = $Buffer.Length
                $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
                $Response.Close()
                continue
            }

            if ($Request.HttpMethod -eq "POST") {
                $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
                $Body = $Reader.ReadToEnd() | ConvertFrom-Json
                $TeamList = @()
                if (Test-Path $TeamPath) {
                    $RawTeam = [System.IO.File]::ReadAllText($TeamPath, [System.Text.Encoding]::UTF8)
                    try { $TeamList = @($RawTeam | ConvertFrom-Json) } catch {}
                }
                $EmailLower = ($Body.email + "").Trim().ToLower()
                $Member = $TeamList | Where-Object { ($_.email + "").ToLower() -eq $EmailLower } | Select-Object -First 1
                if ($Member) {
                    $Member.name = $Body.name
                    if ($Body.role) { $Member.role = $Body.role }
                    if ($Body.status) { $Member.status = $Body.status }
                    if ($Body.password) { $Member.password = $Body.password }
                } else {
                    $Member = [PSCustomObject]@{
                        id = if ($Body.id) { $Body.id } else { "user-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
                        name = $Body.name
                        email = $EmailLower
                        role = if ($Body.role) { $Body.role } else { "suporte" }
                        password = if ($Body.password) { $Body.password } else { "Staff2026@" }
                        status = "active"
                        created_at = (Get-Date).ToString("o")
                    }
                    $TeamList += $Member
                }
                [System.IO.File]::WriteAllText($TeamPath, ($TeamList | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
                $Response.StatusCode = 200
                $ResObj = [PSCustomObject]@{ ok = $true; member = $Member }
                $ResBytes = [System.Text.Encoding]::UTF8.GetBytes(($ResObj | ConvertTo-Json -Depth 10))
                $Response.ContentLength64 = $ResBytes.Length
                $Response.OutputStream.Write($ResBytes, 0, $ResBytes.Length)
                $Response.Close()
                continue
            }

            if ($Request.HttpMethod -eq "DELETE") {
                $DelId = $Request.QueryString["id"]
                $TeamList = @()
                if (Test-Path $TeamPath) {
                    $RawTeam = [System.IO.File]::ReadAllText($TeamPath, [System.Text.Encoding]::UTF8)
                    try { $TeamList = @($RawTeam | ConvertFrom-Json) } catch {}
                }
                $Filtered = @($TeamList | Where-Object { $_.id -ne $DelId })
                [System.IO.File]::WriteAllText($TeamPath, ($Filtered | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
                $Response.StatusCode = 200
                $ResBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true}')
                $Response.ContentLength64 = $ResBytes.Length
                $Response.OutputStream.Write($ResBytes, 0, $ResBytes.Length)
                $Response.Close()
                continue
            }
        }

        # Endpoint de Autenticação Staff (LOGIN)
        if ($UrlPath -eq "api/login" -and $Request.HttpMethod -eq "POST") {
            $Response.ContentType = "application/json; charset=utf-8"
            $Response.AddHeader("Access-Control-Allow-Origin", "*")
            $Response.AddHeader("Cache-Control", "no-cache")
            $TeamPath = Join-Path $Root "data\team.json"

            $Reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
            $Body = $Reader.ReadToEnd() | ConvertFrom-Json
            $EmailLower = ($Body.email + "").Trim().ToLower()
            $Password = ($Body.password + "")

            $TeamList = @()
            if (Test-Path $TeamPath) {
                $RawTeam = [System.IO.File]::ReadAllText($TeamPath, [System.Text.Encoding]::UTF8)
                try { $TeamList = @($RawTeam | ConvertFrom-Json) } catch {}
            }

            $IsMasterCeo = ($EmailLower -eq "dpaulistarp@gmail.com" -or $EmailLower -eq "ceo@distritopaulista.com")
            $Matched = $TeamList | Where-Object { ($_.email + "").ToLower() -eq $EmailLower } | Select-Object -First 1

            if ($IsMasterCeo -and -not $Matched) {
                $Matched = [PSCustomObject]@{
                    id = "user-ceo-01"
                    name = "Blaze / Lomba / Morgan"
                    email = $EmailLower
                    password = "Distrito2026@"
                    role = "ceo"
                    status = "active"
                    created_at = (Get-Date).ToString("o")
                }
                $TeamList = @($Matched) + $TeamList
                [System.IO.File]::WriteAllText($TeamPath, ($TeamList | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
            }

            if ($Matched) {
                if ($Matched.status -ne "active") {
                    $Response.StatusCode = 403
                    $ResBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"message":"Acesso negado: Conta suspensa ou bloqueada."}')
                    $Response.ContentLength64 = $ResBytes.Length
                    $Response.OutputStream.Write($ResBytes, 0, $ResBytes.Length)
                    $Response.Close()
                    continue
                }

                $IsCeoValid = $IsMasterCeo -and ($Password -eq "Distrito2026@" -or $Password -eq $Matched.password)
                if (-not $Matched.password) {
                    $Matched.password = $Password
                    [System.IO.File]::WriteAllText($TeamPath, ($TeamList | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
                } elseif (-not $IsCeoValid -and $Matched.password -ne $Password) {
                    $Response.StatusCode = 401
                    $ResBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"message":"Senha incorreta. Verifique suas credenciais de Staff."}')
                    $Response.ContentLength64 = $ResBytes.Length
                    $Response.OutputStream.Write($ResBytes, 0, $ResBytes.Length)
                    $Response.Close()
                    continue
                }

                $Response.StatusCode = 200
                $UserObj = [PSCustomObject]@{
                    id = $Matched.id
                    name = $Matched.name
                    email = $Matched.email
                    role = $Matched.role
                    status = $Matched.status
                }
                $ResObj = [PSCustomObject]@{ ok = $true; user = $UserObj }
                $ResBytes = [System.Text.Encoding]::UTF8.GetBytes(($ResObj | ConvertTo-Json -Depth 10))
                $Response.ContentLength64 = $ResBytes.Length
                $Response.OutputStream.Write($ResBytes, 0, $ResBytes.Length)
                $Response.Close()
                continue
            }

            $Response.StatusCode = 404
            $ResBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"message":"Acesso negado: Credenciais inválidas ou e-mail não cadastrado na Staff."}')
            $Response.ContentLength64 = $ResBytes.Length
            $Response.OutputStream.Write($ResBytes, 0, $ResBytes.Length)
            $Response.Close()
            continue
        }

        # Prevenir Path Traversal
        $SafePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $UrlPath))
        if (-not $SafePath.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
            $Response.StatusCode = 403
            $Buffer = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
            $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
            $Response.Close()
            continue
        }

        if (Test-Path $SafePath -PathType Leaf) {
            $Ext = [System.IO.Path]::GetExtension($SafePath).ToLower()
            $ContentType = $MimeTypes[$Ext]
            if (-not $ContentType) { $ContentType = "application/octet-stream" }

            $Response.ContentType = $ContentType
            $Response.AddHeader("Access-Control-Allow-Origin", "*")
            $Bytes = [System.IO.File]::ReadAllBytes($SafePath)
            $Response.ContentLength64 = $Bytes.Length
            $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
        } else {
            $Response.StatusCode = 404
            $Buffer = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $Response.OutputStream.Write($Buffer, 0, $Buffer.Length)
        }

        $Response.Close()
    }
} catch {
    Write-Host "Erro no servidor: $_" -ForegroundColor Red
} finally {
    if ($Listener.IsListening) {
        $Listener.Stop()
    }
    $Listener.Close()
}
