$ErrorActionPreference = "Stop"

$secureMnemonic = Read-Host "Unesite mnemonic vlasnika industrial.dot naloga" -AsSecureString
$mnemonicPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureMnemonic)

try {
    $env:MNEMONIC = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($mnemonicPointer)
    npm.cmd run deploy:devnet

    if ($LASTEXITCODE -ne 0) {
        throw "Deploy nije uspeo (exit code $LASTEXITCODE)."
    }
}
finally {
    Remove-Item Env:MNEMONIC -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($mnemonicPointer)
    $secureMnemonic.Dispose()
}
