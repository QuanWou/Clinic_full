param([string]$ConfigPath='',[switch]$Seed)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskConfigFile=if($ConfigPath){$ConfigPath}else{Join-Path $taskRoot '.runtime/main/config.json'}
$taskConfig=Get-Content -LiteralPath $taskConfigFile -Raw|ConvertFrom-Json -AsHashtable
$taskLauncher=if($taskConfig.bundleDevelopment){Join-Path $taskRoot 'setup/start-dev.ps1'}else{Join-Path $PSScriptRoot 'start-core.ps1'}
& $taskLauncher -ConfigPath $taskConfigFile -Seed:$Seed
exit 0
