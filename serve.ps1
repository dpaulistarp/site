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
        if ([string]::IsNullOrWhiteSpace($UrlPath)) { $UrlPath = "index.html" }

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
