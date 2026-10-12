function Save-ApplicationRuntimeState([string]$StatePath, $State) {
    $taskTemporaryState = Join-Path ([IO.Path]::GetDirectoryName($StatePath)) ('processes-' + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
        [IO.File]::WriteAllText($taskTemporaryState, ($State | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
        for ($taskSaveAttempt = 0; $taskSaveAttempt -lt 30; $taskSaveAttempt++) {
            try {
                [IO.File]::Move($taskTemporaryState, $StatePath, $true)
                return
            } catch [IO.IOException] {
                if ($taskSaveAttempt -eq 29) { throw }
                Start-Sleep -Milliseconds 100
            }
        }
    } finally {
        if (Test-Path -LiteralPath $taskTemporaryState) { Remove-Item -LiteralPath $taskTemporaryState }
    }
}
