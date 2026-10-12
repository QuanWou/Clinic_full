#requires -Version 7.4
param([string]$DatabaseName='clinic_team_current',[string]$ComposeProject='clinic-team-dev')
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskRuntime=Join-Path $taskRoot '.runtime/main'
$taskConfigPath=Join-Path $taskRuntime 'config.json'
$taskCompose=Join-Path $PSScriptRoot 'docker-compose.dev.yml'
$taskEnvPath=Join-Path $taskRuntime 'docker.env'
$taskData=Join-Path $taskRoot 'database'
if($DatabaseName -notmatch '^[a-z][a-z0-9_]{0,62}$' -or $DatabaseName -in @('postgres','template0','template1','clinic_db','clinic_team_dev')){throw 'Use a new development database name, for example clinic_team_current'}
if($ComposeProject -notmatch '^[a-z][a-z0-9_-]*$'){throw 'Invalid development Compose project name'}
if(-not(Test-Path -LiteralPath $taskConfigPath)){throw 'Run setup/setup-dev.ps1 from the original IntelliJ bundle first'}
$taskCfg=Get-Content -LiteralPath $taskConfigPath -Raw | ConvertFrom-Json -AsHashtable
if($taskCfg.bundleDevelopment -ne $true -or $taskCfg.databaseHost -ne '127.0.0.1'){throw 'Restore accepts only the local development bundle configuration'}
if($taskCfg.runtimePassword -notmatch '^[a-fA-F0-9]{64}$'){throw 'Invalid development runtimePassword'}
if(-not $taskCfg.nativePostgres){
 if($taskCfg.databasePassword -notmatch '^[a-fA-F0-9]{64}$'){throw 'Invalid development databasePassword'}
 if(-not(Test-Path -LiteralPath $taskEnvPath) -or -not(Test-Path -LiteralPath $taskCompose)){throw 'Original development Docker setup is missing'}
}
$taskStatePath=Join-Path $taskRuntime 'processes.json'
if(Test-Path -LiteralPath $taskStatePath){
 $taskState=Get-Content -LiteralPath $taskStatePath -Raw | ConvertFrom-Json -AsHashtable
 foreach($taskRecord in $taskState.processes){
  $taskProcess=Get-Process -Id $taskRecord.id -ErrorAction SilentlyContinue
  if($taskProcess -and $taskProcess.Path -eq $taskRecord.executable -and $taskProcess.StartTime.ToUniversalTime().Ticks -eq ([DateTimeOffset]$taskRecord.startedAt).UtcTicks){throw 'Stop the development application with setup/stop-dev.ps1 before restoring'}
 }
}
if($taskCfg.nativePostgres){
 & (Join-Path $taskCfg.toolchain.nodeBin 'node.exe') (Join-Path $PSScriptRoot 'restore-current-data-native.mjs') $DatabaseName
 if($LASTEXITCODE){throw 'Native PostgreSQL snapshot restore failed; inspect the preceding diagnostic'}
 exit 0
}
$taskSnapshot=Get-Content (Join-Path $taskData 'snapshot.json') -Raw | ConvertFrom-Json -AsHashtable
$taskDump=Join-Path $taskData $taskSnapshot.dumpFile
if((Get-FileHash -LiteralPath $taskDump -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskSnapshot.dumpSha256){throw 'Database dump checksum differs'}
function Invoke-TeamCompose { & docker.exe compose -p $ComposeProject --env-file $taskEnvPath -f $taskCompose @args; if($LASTEXITCODE){throw 'Development Docker operation failed'} }
function Invoke-TeamSql([string]$taskSql,[string]$taskDb='postgres'){
 $taskSql | & docker.exe compose -p $ComposeProject --env-file $taskEnvPath -f $taskCompose exec -T postgres psql -X -U postgres -d $taskDb -v ON_ERROR_STOP=1
 if($LASTEXITCODE){throw 'Snapshot role setup failed'}
}
function Sql-Literal([string]$value){return "'"+$value.Replace("'","''")+"'"}
function Sql-Identifier([string]$value){return '"'+$value.Replace('"','""')+'"'}
Invoke-TeamCompose up -d --wait postgres
$taskExists=& docker.exe compose -p $ComposeProject --env-file $taskEnvPath -f $taskCompose exec -T postgres psql -X -U postgres -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$DatabaseName';"
if($LASTEXITCODE -or $taskExists.Trim() -ne '0'){throw "Database $DatabaseName already exists; it has been preserved. Choose another new database name with -DatabaseName"}
$taskRoles=Get-Content (Join-Path $taskData 'roles.json') -Raw | ConvertFrom-Json
$taskGrants=Get-Content (Join-Path $taskData 'role-memberships.json') -Raw | ConvertFrom-Json
$taskSql='BEGIN;'
foreach($taskRole in $taskRoles){
 $taskName=Sql-Literal $taskRole.name
 $taskInherit=if($taskRole.inherit){'INHERIT'}else{'NOINHERIT'}
 $taskSql+='DO $body$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='+$taskName+') THEN EXECUTE ''CREATE ROLE '' || quote_ident('+$taskName+') || '' NOLOGIN NOSUPERUSER NOBYPASSRLS '+$taskInherit+'''; END IF; END $body$;'
}
$taskTopology=Get-Content (Join-Path $taskRoot 'backend/core-topology.json') -Raw | ConvertFrom-Json -AsHashtable
foreach($taskModule in @($taskTopology.Values | ForEach-Object {$_})){
 $taskRole=Sql-Identifier "main_v2_${taskModule}_runtime"
 $taskSql+="ALTER ROLE $taskRole LOGIN INHERIT PASSWORD '$($taskCfg.runtimePassword)';"
}
foreach($taskGrant in $taskGrants){$taskSql+='GRANT '+(Sql-Identifier $taskGrant.role)+' TO '+(Sql-Identifier $taskGrant.member)+';'}
$taskSql+='COMMIT;'
Invoke-TeamSql $taskSql
Invoke-TeamCompose exec -T postgres createdb -U postgres -O postgres $DatabaseName
$taskRemoteDump='/tmp/clinic-current-'+[guid]::NewGuid().ToString('N')+'.dump'
try{
 Invoke-TeamCompose cp $taskDump "postgres:$taskRemoteDump"
 Invoke-TeamCompose exec -T postgres pg_restore -U postgres -d $DatabaseName --no-owner --exit-on-error --single-transaction $taskRemoteDump
}finally{
 & docker.exe compose -p $ComposeProject --env-file $taskEnvPath -f $taskCompose exec -T postgres rm -f -- $taskRemoteDump
}
# Compare every table against the exported source counts before selecting the DB.
$taskExpected=Get-Content (Join-Path $taskData 'table-counts.json') -Raw | ConvertFrom-Json
$taskCountParts=@()
foreach($taskTable in $taskExpected){
 $taskCountParts+='SELECT '+(Sql-Literal $taskTable.schema)+' AS schema,'+(Sql-Literal $taskTable.name)+' AS name,count(*) AS rows FROM '+(Sql-Identifier $taskTable.schema)+'.'+(Sql-Identifier $taskTable.name)
}
$taskCountSql='SELECT json_agg(t ORDER BY schema,name) FROM ('+($taskCountParts -join ' UNION ALL ')+') t;'
$taskActualText=& docker.exe compose -p $ComposeProject --env-file $taskEnvPath -f $taskCompose exec -T postgres psql -X -U postgres -d $DatabaseName -At -v ON_ERROR_STOP=1 -c $taskCountSql
if($LASTEXITCODE){throw 'Restored table verification failed'}
$taskActual=($taskActualText -join '') | ConvertFrom-Json
for($taskIndex=0;$taskIndex -lt $taskExpected.Count;$taskIndex++){
 if($taskActual[$taskIndex].schema -ne $taskExpected[$taskIndex].schema -or $taskActual[$taskIndex].name -ne $taskExpected[$taskIndex].name -or $taskActual[$taskIndex].rows -ne $taskExpected[$taskIndex].rows){throw 'Restored row counts differ; config has not been switched'}
}
$taskBackup=Join-Path $taskRuntime ('config-before-data-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'.json')
Copy-Item -LiteralPath $taskConfigPath -Destination $taskBackup
$taskCfg.databaseName=$DatabaseName
$taskCfg.clinic=$taskSnapshot.clinicId
$taskCfg.branch=$taskSnapshot.branchId
$taskCfg.accounts=@{}
$taskCfg.Remove('demoPassword') | Out-Null
$taskCfg.Remove('demoPatientCreated') | Out-Null
$taskCfg|ConvertTo-Json -Depth 16|Set-Content -LiteralPath $taskConfigPath -Encoding utf8
$taskSnapshot|ConvertTo-Json -Depth 8|Set-Content (Join-Path $taskRuntime 'restored-snapshot.json')
'Current snapshot restored' | Set-Content (Join-Path $taskRuntime 'database-initialized')
Write-Host "Restored and verified $($taskExpected.Count) tables in $DatabaseName. Previous databases have been preserved."
Write-Host 'Run setup/start-dev.ps1. Use existing application accounts/passwords; do not run seed-demo.ps1 for this snapshot.'
