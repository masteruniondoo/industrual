param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CdmArguments
)

$shimPath = Join-Path $PSScriptRoot "cdm-windows-spawn-shim.cjs"
$shimPathForNode = $shimPath.Replace("\", "/")
$previousNodeOptions = $env:NODE_OPTIONS

try {
    $env:NODE_OPTIONS = "--require=$shimPathForNode"
    if ($previousNodeOptions) {
        $env:NODE_OPTIONS = "$env:NODE_OPTIONS $previousNodeOptions"
    }

    & cdm.cmd @CdmArguments
    exit $LASTEXITCODE
}
finally {
    $env:NODE_OPTIONS = $previousNodeOptions
}
