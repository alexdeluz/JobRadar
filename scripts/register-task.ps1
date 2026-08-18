# Registra la tarea diaria de Job Radar en el Programador de tareas de Windows.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1
$repo = Split-Path -Parent $PSScriptRoot
$pnpm = (Get-Command pnpm).Source
$action = New-ScheduledTaskAction -Execute $pnpm -Argument 'scrape' -WorkingDirectory $repo
$triggerDaily = New-ScheduledTaskTrigger -Daily -At 09:30
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'JobRadar Scrape' -Action $action `
  -Trigger $triggerDaily, $triggerLogon -Settings $settings -Force
Write-Host 'Tarea "JobRadar Scrape" registrada: diaria 09:30 + al iniciar sesión (con catch-up).'
