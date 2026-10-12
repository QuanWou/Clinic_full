#requires -Version 7.4
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'local-tools.ps1')
& (Join-Path $PSScriptRoot 'build-dev.ps1')
