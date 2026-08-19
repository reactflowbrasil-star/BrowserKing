$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$relayUrl = 'http://127.0.0.1:17840'
$cloudflared = Join-Path $root 'tools\cloudflared.exe'
$configPath = Join-Path $root '.browserking-remote.json'
$internetPath = Join-Path $root '.browserking-internet.json'
$logPath = Join-Path $root 'cloudflared-internet.log'
$relayProcess = $null
$tunnelProcess = $null

Set-Location $root

if (-not (Test-Path -LiteralPath $cloudflared)) {
    New-Item -ItemType Directory -Path (Split-Path $cloudflared) -Force | Out-Null
    Write-Host 'Baixando Cloudflare Tunnel oficial...'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared
}

try {
    try { Invoke-RestMethod "$relayUrl/extension/bootstrap" -TimeoutSec 2 | Out-Null }
    catch {
        $relayProcess = Start-Process node -ArgumentList 'remote-relay.js' -WorkingDirectory $root -WindowStyle Hidden -PassThru
        Start-Sleep -Milliseconds 700
    }

    $pairing = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
    Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue
    $tunnelProcess = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel', '--no-autoupdate', '--url', $relayUrl, '--logfile', $logPath) -WorkingDirectory $root -WindowStyle Hidden -PassThru

    $deadline = (Get-Date).AddSeconds(45)
    $publicUrl = $null
    do {
        Start-Sleep -Milliseconds 500
        if ($tunnelProcess.HasExited) { throw 'Cloudflare Tunnel encerrou antes de publicar o endereço.' }
        if (Test-Path -LiteralPath $logPath) {
            $match = [regex]::Match((Get-Content -Raw -LiteralPath $logPath), 'https://[a-z0-9-]+\.trycloudflare\.com')
            if ($match.Success) { $publicUrl = $match.Value }
        }
    } until ($publicUrl -or (Get-Date) -gt $deadline)
    if (-not $publicUrl) { throw 'O endereço externo não foi criado em 45 segundos.' }

    @{ url = $publicUrl; updatedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $internetPath -Encoding UTF8
    Clear-Host
    Write-Host 'HatClaw - ACESSO PELA INTERNET' -ForegroundColor Yellow
    Write-Host ''
    Write-Host "Endereco no app: $publicUrl" -ForegroundColor Cyan
    Write-Host "Token: $($pairing.token)" -ForegroundColor Green
    Write-Host ''
    Write-Host 'Mantenha esta janela aberta. Ctrl+C encerra o acesso externo.'
    while (-not $tunnelProcess.HasExited) { Start-Sleep -Seconds 2 }
} finally {
    if ($tunnelProcess -and -not $tunnelProcess.HasExited) { Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue }
    if ($relayProcess -and -not $relayProcess.HasExited) { Stop-Process -Id $relayProcess.Id -Force -ErrorAction SilentlyContinue }
}
