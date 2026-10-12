#requires -Version 7.4
param(
 [string]$DatabaseHost='127.0.0.1',
 [int]$DatabasePort=5433,
 [string]$DatabaseName='clinic_final_dev',
 [string]$DatabaseUser='postgres',
 [string]$DatabasePassword=$env:PGPASSWORD,
 [string]$PsqlPath='C:\PostgreSQL\17\bin\psql.exe'
)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskRuntime=Join-Path $taskRoot '.runtime/main'
$taskConfigPath=Join-Path $taskRuntime 'config.json'
if($DatabaseName -notmatch '^[a-z][a-z0-9_]{0,62}$'){throw 'Invalid database name'}
if(-not(Test-Path -LiteralPath $PsqlPath)){$PsqlPath=(Get-Command psql.exe -ErrorAction Stop).Source}
New-Item -ItemType Directory -Force -Path $taskRuntime | Out-Null
function New-LocalSecret { [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant() }
if(Test-Path -LiteralPath $taskConfigPath){
 $taskCfg=Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json -AsHashtable
 if($taskCfg.bundleDevelopment -ne $true -or $taskCfg.nativePostgres -ne $true){throw 'Existing configuration belongs to another setup'}
}else{
 $taskCfg=@{bundleDevelopment=$true;nativePostgres=$true;databaseHost=$DatabaseHost;databasePort=$DatabasePort;databaseName=$DatabaseName;databaseUser=$DatabaseUser;databasePassword=[string]$DatabasePassword;runtimePassword=(New-LocalSecret);peerSecret=(New-LocalSecret);userSecret=(New-LocalSecret);psqlPath=$PsqlPath;ports=@{identity=18001;doctor=18002;patient=18003;appointment=18004;billing=18005;gateway=18090;web=4176};accounts=@{}}
}
$taskJava=(Get-Command java.exe -ErrorAction Stop).Source
$taskMaven=(Get-Command mvn.cmd -ErrorAction Stop).Source
$taskNode=(Get-Command node.exe -ErrorAction Stop).Source
$taskPwsh=(Get-Command pwsh.exe -ErrorAction Stop).Source
$taskCfg.toolchain=@{javaHome=(Split-Path (Split-Path $taskJava));mavenBin=(Split-Path $taskMaven);nodeBin=(Split-Path $taskNode);pwsh=$taskPwsh}
$env:PGPASSWORD=[string]$taskCfg.databasePassword
function Invoke-LocalSql([string]$taskSql,[string]$taskDatabase=$taskCfg.databaseName){
 $taskOutput=$taskSql | & $taskCfg.psqlPath -X -w -h $taskCfg.databaseHost -p $taskCfg.databasePort -U $taskCfg.databaseUser -d $taskDatabase -v ON_ERROR_STOP=1 -At
 if($LASTEXITCODE){throw 'PostgreSQL initialization failed'}
 return $taskOutput
}
$taskExists=Invoke-LocalSql "SELECT count(*) FROM pg_database WHERE datname='$($taskCfg.databaseName)';" 'postgres'
if([int]$taskExists -eq 0){$null=Invoke-LocalSql "CREATE DATABASE $($taskCfg.databaseName) ENCODING 'UTF8';" 'postgres'}
$taskInitialized=Join-Path $taskRuntime 'database-initialized'
if(-not(Test-Path -LiteralPath $taskInitialized)){
 $taskTableExists=Invoke-LocalSql "SELECT to_regclass('identity.users') IS NOT NULL;"
 if($taskTableExists.Trim() -ne 'f'){throw 'Database is not empty; initialization refused'}
 $taskAuthSql=(& $taskNode (Join-Path $PSScriptRoot 'bootstrap-auth.mjs')) -join "`n"
 if($LASTEXITCODE){throw 'Auth bootstrap generation failed'}
 $taskSql="BEGIN;`n"+$taskAuthSql+"`n"
 $taskTopology=Get-Content (Join-Path $taskRoot 'backend/core-topology.json') -Raw | ConvertFrom-Json -AsHashtable
 foreach($taskModule in @($taskTopology.Values | ForEach-Object {$_})){
  $taskRole="main_v2_${taskModule}_runtime"
  # Refuse to change a login already owned by another project.
  $taskRoleExists=Invoke-LocalSql "SELECT count(*) FROM pg_roles WHERE rolname='$taskRole';"
  if([int]$taskRoleExists -ne 0){throw "Role $taskRole already exists; refused to replace credentials"}
  $taskSql+="CREATE ROLE $taskRole LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '$($taskCfg.runtimePassword)';`n"
  if($taskModule -ne 'auth'){
   $taskGroup=if($taskModule -eq 'identity'){'clinic_v2_iam_runtime'}else{"clinic_v2_${taskModule}_runtime"}
   $taskSql+='DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=' + "'$taskGroup') THEN CREATE ROLE $taskGroup NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END " + '$$;' + "`n"
   $taskSql+="GRANT $taskGroup TO $taskRole;`n"
  }
 }
 $taskSql+="GRANT USAGE ON SCHEMA identity TO main_v2_auth_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA identity TO main_v2_auth_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA identity TO main_v2_auth_runtime; COMMIT;"
 $null=Invoke-LocalSql $taskSql
 $taskCfg | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $taskConfigPath -Encoding utf8
 'Initialized by setup/setup-local.ps1' | Set-Content -LiteralPath $taskInitialized
}else{
 $taskCfg | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $taskConfigPath -Encoding utf8
 $null=Invoke-LocalSql 'SELECT 1;'
}
Write-Host "Local PostgreSQL ready: $($taskCfg.databaseHost):$($taskCfg.databasePort)/$($taskCfg.databaseName)"
