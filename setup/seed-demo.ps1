#requires -Version 7.4
$ErrorActionPreference='Stop'
& node.exe (Join-Path $PSScriptRoot 'seed-demo.mjs')
if($LASTEXITCODE){throw 'Demo initialization failed'}
