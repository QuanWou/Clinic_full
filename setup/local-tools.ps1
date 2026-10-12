$taskLocalRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskLocalConfig=Get-Content (Join-Path $taskLocalRoot '.runtime/main/config.json') -Raw | ConvertFrom-Json -AsHashtable
$env:JAVA_HOME=$taskLocalConfig.toolchain.javaHome
$env:PATH="$($env:JAVA_HOME)\bin;$($taskLocalConfig.toolchain.mavenBin);$($taskLocalConfig.toolchain.nodeBin);$env:PATH"
