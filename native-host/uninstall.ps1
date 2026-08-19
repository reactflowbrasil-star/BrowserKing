$key='HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.browserking.windows_controller'
if(Test-Path $key){Remove-Item -LiteralPath $key -Force}
Write-Host 'Host nativo removido do Chrome.'
