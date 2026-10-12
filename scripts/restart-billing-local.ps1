#requires -Version 7.4
param([switch]$Build)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskRuntime=Join-Path $taskRoot '.runtime/main'
$taskConfig=Get-Content -LiteralPath (Join-Path $taskRuntime 'config.json') -Raw | ConvertFrom-Json -AsHashtable
$taskStatePath=Join-Path $taskRuntime 'processes.json'
$taskState=Get-Content -LiteralPath $taskStatePath -Raw | ConvertFrom-Json -AsHashtable
if($taskState.workspace -ne $taskRoot -or $taskState.runtimeRoot -ne $taskRuntime -or $taskState.layout -ne 'five-core-gateway'){throw 'The runtime does not belong to this project.'}
$taskRecords=@($taskState.processes | Where-Object name -eq 'billing')
if($taskRecords.Count -ne 1){throw 'Expected one owned Billing core.'}
$taskRecord=$taskRecords[0]
$taskProcess=Get-Process -Id $taskRecord.id -ErrorAction SilentlyContinue
if($taskProcess){
 if($taskProcess.Path -ne $taskRecord.executable -or $taskProcess.StartTime.ToUniversalTime().Ticks -ne ([DateTimeOffset]$taskRecord.startedAt).UtcTicks){throw 'Billing process identity changed; replacement refused.'}
 Stop-Process -Id $taskProcess.Id
 if(-not $taskProcess.WaitForExit(10000)){throw 'Billing is still holding its JAR.'}
}
. (Join-Path $PSScriptRoot 'runtime-state.ps1')
$taskState.status='STARTING';Save-ApplicationRuntimeState $taskStatePath $taskState
try{
 if(Get-NetTCPConnection -State Listen -LocalPort ([int]$taskConfig.ports.billing) -ErrorAction SilentlyContinue){throw 'Billing port is occupied; replacement refused.'}
 $env:JAVA_HOME=$taskConfig.toolchain.javaHome
 $env:PATH="$($env:JAVA_HOME)\bin;$($taskConfig.toolchain.mavenBin);$($taskConfig.toolchain.nodeBin);$env:PATH"
 if($Build){
  & (Join-Path $taskConfig.toolchain.mavenBin 'mvn.cmd') -q -f (Join-Path $taskRoot 'backend/pom.xml') -pl billing-service -am package -DskipTests '-Dmaven.jar.forceCreation=true' *> (Join-Path $taskRuntime 'payment-billing-build.log')
  if($LASTEXITCODE -ne 0){throw 'Billing build failed; see the private build log.'}
  Write-Host 'Billing build completed.'
 }
 $taskTopology=Get-Content -LiteralPath (Join-Path $taskRoot 'backend/core-topology.json') -Raw | ConvertFrom-Json -AsHashtable
 $taskCorePorts=$taskConfig.ports.Clone();$taskRoutes=@{};$taskServices=@($taskTopology.Values|ForEach-Object{$_}|Where-Object{$_ -ne 'auth'})
 foreach($taskCore in $taskTopology.Keys){foreach($taskModule in $taskTopology[$taskCore]){$taskConfig.ports[$taskModule]=$taskCorePorts[$taskCore];$taskRoutes[$taskModule]="http://127.0.0.1:$($taskCorePorts[$taskCore])/modules/$taskModule"}}
 . (Join-Path $PSScriptRoot 'runtime-peer-environment.ps1')
 $taskEnv=Peer-Environment
 $taskEnv.SPRING_FLYWAY_USER=$taskConfig.databaseUser;$taskEnv.SPRING_FLYWAY_TABLE='flyway_v2_schema_history';$taskEnv.SPRING_FLYWAY_BASELINE_ON_MIGRATE='true';$taskEnv.SPRING_FLYWAY_BASELINE_VERSION='0'
 $taskEnv.APP_SECURITY_JWT_SECRET=$taskConfig.userSecret;$taskEnv.APP_STAFF_IAM_URL=$taskRoutes.identity;$taskEnv.PROJECTION_RELAY_ENABLED='true'
 foreach($taskCore in $taskTopology.Keys){foreach($taskModule in $taskTopology[$taskCore]){
  $taskPrefix=if($taskModule -eq 'identity'){'IAM'}else{$taskModule.ToUpperInvariant()}
  $taskEnv["${taskPrefix}_DB_URL"]="jdbc:postgresql://$($taskConfig.databaseHost):$($taskConfig.databasePort)/$($taskConfig.databaseName)"
  $taskEnv["${taskPrefix}_DB_USER"]="main_v2_${taskModule}_runtime";$taskEnv["${taskPrefix}_DB_PASSWORD"]=$taskConfig.runtimePassword
 }}
 foreach($taskKey in $taskConfig.payments.Keys){$taskEnv[$taskKey]=[string]$taskConfig.payments[$taskKey]}
 $taskEnv.CORE_PORT=[string]$taskCorePorts.billing;$taskEnv.CORE_BASE=Join-Path $taskRuntime 'tomcat/billing'
 $taskJar=Join-Path $taskRoot 'backend/billing-service/target/billing-service-1.0.0-SNAPSHOT.jar'
 $taskChild=Start-Process (Join-Path $taskConfig.toolchain.javaHome 'bin/java.exe') -ArgumentList @('-Xmx512m','-jar',('"'+$taskJar+'"')) -Environment $taskEnv -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime 'billing.log') -RedirectStandardError (Join-Path $taskRuntime 'billing.stderr')
 $taskState.processes=@($taskState.processes|Where-Object name -ne 'billing')+@(@{name='billing';id=$taskChild.Id;startedAt=$taskChild.StartTime.ToUniversalTime().ToString('o');executable=$taskChild.Path})
 Save-ApplicationRuntimeState $taskStatePath $taskState
 for($taskTry=0;$taskTry -lt 180;$taskTry++){
  if($taskChild.HasExited){throw 'Billing exited; inspect its private runtime logs.'}
  try{if((Invoke-RestMethod "http://127.0.0.1:$($taskCorePorts.billing)/actuator/health" -TimeoutSec 2).status -eq 'UP'){$taskState.status='RUNNING';Save-ApplicationRuntimeState $taskStatePath $taskState;Write-Host 'Billing restarted with local payment configuration.';exit 0}}catch{}
  Start-Sleep -Milliseconds 500
 }
 throw 'Billing health did not become UP.'
}catch{$taskState.status='FAILED';Save-ApplicationRuntimeState $taskStatePath $taskState;throw}
