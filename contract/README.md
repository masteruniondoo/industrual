# Industrial Actuator Contract

Minimal Solidity contract for Polkadot Products Devnet / Paseo Asset Hub
(para ID 1000, EVM chain ID 420420417).

Package: `@industrial/actuator`

The contract accepts exactly 1 PAS, increments `triggerNonce`, and emits an
`Activated` event. It does not control the fan and does not report physical
actuator state.

```powershell
npm.cmd install
npm.cmd run cdm:build:devnet
npm.cmd run cdm -- init -n devnet
npm.cmd run cdm -- account bal -n devnet
npm.cmd run cdm -- account map -n devnet
npm.cmd run cdm -- deploy -n devnet
```

Do not use `--bootstrap`. Never place deployment credentials in this project.

## Deployment status

Deployed on Products Devnet at `0x0863b94ecffca8bca83306cda06b07a9dfef3374`
(transaction `0xafb111f3ffc868b8869e828a93c229e2e46a8b9c589212c9e683d15396a41525`,
block #13024785, `triggerNonce = 0` after deployment).

`cdm deploy -n devnet` currently fails with `Revive.ContractTrapped`: it batches
`instantiate_with_code` with `ContractRegistry.publishLatest`, and the devnet
registry `0x59b0245778917af55224e5f8fb55f7f8d452619f` traps whenever a new
package name is inserted. The deployment was therefore made with
`node ../scripts/deploy-actuator-contract.mjs`, which submits only
`instantiate_with_code`. The package name stays `@industrial/actuator`; rerun
the CDM flow above once the registry accepts new names. See
`../docs/ACTUATOR.md` for the evidence.

The `npm run cdm -- ...` wrapper only adapts CDM's internal `npx` process spawn
for Windows. It does not alter CDM arguments, credentials, or deployment data.
