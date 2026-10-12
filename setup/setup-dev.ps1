#requires -Version 7.4
param([int]$DatabasePort=55432,[int]$CorePortBase=18000,[int]$GatewayPort=18090,[int]$WebPort=4176)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskRuntime=Join-Path $taskRoot '.runtime/main'
$taskConfigPath=Join-Path $taskRuntime 'config.json'
foreach($taskTool in @('docker.exe','java.exe','mvn.cmd','node.exe','npm.cmd')){if(-not(Get-Command $taskTool -ErrorAction SilentlyContinue)){throw "Install $taskTool and reopen the terminal"}}
& docker.exe info *> $null
if($LASTEXITCODE){throw 'Start Docker Desktop first'}
New-Item -ItemType Directory -Force -Path $taskRuntime | Out-Null
function New-Secret { [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant() }
if(Test-Path -LiteralPath $taskConfigPath){
 $taskCfg=Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json -AsHashtable
 if($taskCfg.bundleDevelopment -ne $true){throw 'This setup accepts only its own development configuration'}
}else{
 $taskCfg=@{bundleDevelopment=$true;databaseHost='127.0.0.1';databasePort=$DatabasePort;databaseName='clinic_team_dev';databaseUser='postgres';databasePassword=(New-Secret);runtimePassword=(New-Secret);peerSecret=(New-Secret);userSecret=(New-Secret);ports=@{identity=($CorePortBase+1);doctor=($CorePortBase+2);patient=($CorePortBase+3);appointment=($CorePortBase+4);billing=($CorePortBase+5);gateway=$GatewayPort;web=$WebPort};accounts=@{}}
 $taskCfg | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $taskConfigPath -Encoding utf8
}
$taskCompose=Join-Path $PSScriptRoot 'docker-compose.dev.yml'
$taskEnvPath=Join-Path $taskRuntime 'docker.env'
"POSTGRES_PASSWORD=$($taskCfg.databasePassword)`nPOSTGRES_PORT=$($taskCfg.databasePort)" | Set-Content -LiteralPath $taskEnvPath -Encoding utf8
function Invoke-TeamCompose { & docker.exe compose -p clinic-team-dev --env-file $taskEnvPath -f $taskCompose @args; if($LASTEXITCODE){throw 'Development Docker Compose command failed'} }
Invoke-TeamCompose up -d --wait postgres
function Invoke-TeamSql([string]$taskSql){
 $taskSql | & docker.exe compose -p clinic-team-dev --env-file $taskEnvPath -f $taskCompose exec -T postgres psql -X -U postgres -d clinic_team_dev -v ON_ERROR_STOP=1
 if($LASTEXITCODE){throw 'Development database initialization failed'}
}
$taskInitialized=Join-Path $taskRuntime 'database-initialized'
if(-not(Test-Path -LiteralPath $taskInitialized)){
 $taskExists=& docker.exe compose -p clinic-team-dev --env-file $taskEnvPath -f $taskCompose exec -T postgres psql -X -U postgres -d clinic_team_dev -Atc "SELECT to_regclass('identity.users') IS NOT NULL;"
 if($LASTEXITCODE -or $taskExists.Trim() -ne 'f'){throw 'Database is not empty; use the existing package configuration rather than initializing it again'}
 $taskAuthMigration=Join-Path $taskRoot 'backend/identity-service/modules/auth/src/main/resources/modules/auth/db/migration'
 $taskAuthSql=(& node.exe (Join-Path $PSScriptRoot 'bootstrap-auth.mjs')) -join "`n"
 if($LASTEXITCODE){throw 'Auth bootstrap generation failed'}
 $taskSql="BEGIN;`n"+$taskAuthSql+"`n"
 $taskTopology=Get-Content (Join-Path $taskRoot 'backend/core-topology.json') -Raw | ConvertFrom-Json -AsHashtable
 foreach($taskModule in @($taskTopology.Values | ForEach-Object {$_})){
  $taskRole="main_v2_${taskModule}_runtime"
  $taskSql+="CREATE ROLE $taskRole LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '$($taskCfg.runtimePassword)';`n"
  if($taskModule -ne 'auth'){
   $taskGroup=if($taskModule -eq 'identity'){'clinic_v2_iam_runtime'}else{"clinic_v2_${taskModule}_runtime"}
   $taskSql+="CREATE ROLE $taskGroup NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT $taskGroup TO $taskRole;`n"
  }
 }
 $taskSql+="GRANT USAGE ON SCHEMA identity TO main_v2_auth_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA identity TO main_v2_auth_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA identity TO main_v2_auth_runtime; COMMIT;"
 Invoke-TeamSql $taskSql
 'Initialized by setup-dev.ps1' | Set-Content -LiteralPath $taskInitialized
}
Write-Host 'Development database ready. Next: setup/build-dev.ps1, setup/start-dev.ps1, then setup/seed-demo.ps1.'
