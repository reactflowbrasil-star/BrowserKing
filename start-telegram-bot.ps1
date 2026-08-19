param(
  [string]$BotToken = '',
  [string]$RelayToken = '',
  [string]$AllowedChats = '',
  [string]$RelayUrl = 'https://hatclaw.com/extencao'
)

$botTokenValue = $BotToken
if (-not $botTokenValue) {
  $botTokenValue = $env:BROWSERKING_TELEGRAM_BOT_TOKEN
}
if (-not $botTokenValue) {
  throw 'BotToken é obrigatório quando BROWSERKING_TELEGRAM_BOT_TOKEN não estiver definido.'
}

$relayTokenValue = $RelayToken
if (-not $relayTokenValue) {
  $relayTokenPath = Join-Path $PSScriptRoot '.browserking-remote.json'
  if (Test-Path $relayTokenPath) {
    try {
      $relayTokenValue = (Get-Content $relayTokenPath -Raw | ConvertFrom-Json).token
    } catch {
      throw "Não foi possível ler o token do relay em $relayTokenPath."
    }
  }
}

if (-not $relayTokenValue) {
  throw 'RelayToken é obrigatório quando o token não puder ser lido de .browserking-remote.json.'
}

$allowedChatsValue = $AllowedChats
if (-not $allowedChatsValue) {
  $allowedChatsValue = $env:BROWSERKING_TELEGRAM_ALLOWED_CHATS
}

$env:BROWSERKING_TELEGRAM_BOT_TOKEN = $botTokenValue
$env:BROWSERKING_RELAY_TOKEN = $relayTokenValue
$env:BROWSERKING_TELEGRAM_ALLOWED_CHATS = $allowedChatsValue
$env:BROWSERKING_RELAY_URL = $RelayUrl

try {
  node (Join-Path $PSScriptRoot 'telegram-bot.js')
} finally {
  Remove-Item Env:BROWSERKING_TELEGRAM_BOT_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:BROWSERKING_RELAY_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:BROWSERKING_TELEGRAM_ALLOWED_CHATS -ErrorAction SilentlyContinue
  Remove-Item Env:BROWSERKING_RELAY_URL -ErrorAction SilentlyContinue
}
