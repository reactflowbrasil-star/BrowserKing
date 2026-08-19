param([Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId)
$ErrorActionPreference='Stop'
$hostDir=$PSScriptRoot
$manifestPath=Join-Path $hostDir 'com.browserking.windows_controller.json'
$launcher=(Join-Path $hostDir 'browserking-native.cmd').Replace('\','\\')
$manifest=@{
  name='com.browserking.windows_controller'
  description='HatClaw secure audited Windows controller'
  path=$launcher
  type='stdio'
  allowed_origins=@("chrome-extension://$ExtensionId/")
}|ConvertTo-Json -Depth 4
[IO.File]::WriteAllText($manifestPath,$manifest,[Text.UTF8Encoding]::new($false))
$key='HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.browserking.windows_controller'
New-Item -Path $key -Force|Out-Null
Set-ItemProperty -Path $key -Name '(default)' -Value $manifestPath
Write-Host "Host instalado para a extensão $ExtensionId"
Write-Host "Abra chrome-extension://$ExtensionId/control-center.html"
