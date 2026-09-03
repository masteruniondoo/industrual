# Warehouse Actuator Demo

## Purpose

The actuator extension closes the demonstration loop without conflating an
on-chain payment with physical hardware state:

```text
DHT11 -> ESP32 -> industrial.dot -> Celerity

User -> 1 PAS -> Actuator contract -> finalized triggerNonce
     -> ESP32 light client -> relay -> USB ventilation fan
     -> changed environment -> DHT11 -> Celerity
```

The Solidity contract only proves that exactly 1 PAS was paid and a new
activation nonce exists. It does not contact the ESP32, control the relay, run
a timer, or report that the fan is running.

## Target network and contract

- Network: Polkadot Products Devnet / Paseo Asset Hub
- Para ID: `1000`
- EVM chain ID: `420420417`
- Runtime: `pallet-revive` / PolkaVM
- CDM package: `@industrial/actuator`
- Price: exactly `1 PAS` (`1e18` in Solidity)
- Activation duration: `60 seconds`

### Deployment

| | |
|---|---|
| Address | `0x0863b94ecffca8bca83306cda06b07a9dfef3374` |
| Transaction | `0xafb111f3ffc868b8869e828a93c229e2e46a8b9c589212c9e683d15396a41525` |
| Block | `#13024785` (`0x89bbc9ee6d605db1c13828ed015bacd4255e07a0fdf5a9776abfb383d2be72cf`) |
| Deployer | `5Ckonvibt6UtXAoGb5jQycH96xUscfMGzTcuYAJxou48pAN2` / `0x4059d63174aac199416578a73123e98d477e632c` |
| State after deployment | `triggerNonce = 0`, `PRICE = 1000000000000000000`, `ACTIVATION_SECONDS = 60` |
| CDM registry entry | none — see below |

The address lives in one place, `lib/actuator/config.ts`, and can be overridden
with `NEXT_PUBLIC_ACTUATOR_CONTRACT_ADDRESS`. Without a valid address the
frontend keeps the activation button disabled.

### Why the deployment skips the CDM registry

`cdm deploy -n devnet` submits `Revive.instantiate_with_code` and
`ContractRegistry.publishLatest` as one `batch_all`. The registry deployed on
the devnet, `0x59b0245778917af55224e5f8fb55f7f8d452619f`, currently traps
(`Revive.ContractTrapped`) whenever `publishLatest` has to insert a **new**
package name, so the atomic batch reverts and nothing is deployed.

Verified by read-only dry runs against that registry:

- new names that sort after every registered name succeed
  (`@yolodot/zzz`, `@yz/x`, `@zzz/x`)
- every other new name traps, regardless of caller or funding
  (`@industrial/actuator`, `@aaa/bbb`, `@y/x`, `@yolodot/aaa`,
  and `@confidao/newthing` from the account that owns `@confidao/dao`)
- already registered names do not trap — they return clean
  `Unauthorized` / `StorageDepositNotEnoughFunds` reverts

The contract itself is unaffected: its instantiation dry run succeeds and the
deployed contract answers `triggerNonce`, `PRICE` and `ACTIVATION_SECONDS`.
`scripts/deploy-actuator-contract.mjs` therefore performs only
`Revive.instantiate_with_code`:

```bash
node scripts/deploy-actuator-contract.mjs --dry-run   # inspect, submit nothing
node scripts/deploy-actuator-contract.mjs             # deploy
```

The deployer key is read from the local CDM keystore (`~/.cdm/accounts.json`)
or `CDM_MNEMONIC`, and is never printed or written anywhere. Deployment facts
are written to `contract/target/actuator-deployment.json`.

Once the devnet registry accepts new names again, `cdm deploy -n devnet`
registers the package under `@industrial/actuator` in the normal way; that
publishes a fresh instance, so update `lib/actuator/config.ts` if it is used.

## ESP32 telemetry

The target `/sensor.txt` response is:

```text
T=29.0,H=30.8,N=18,S=OFF
```

- `T`: temperature
- `H`: humidity
- `N`: last finalized contract trigger nonce observed by the ESP32
- `S`: physical actuator state, exactly `ON` or `OFF`

During migration, the application also accepts the original `T,H` response.
Missing actuator fields remain unknown and are never fabricated.

The Celerity payload is derived only from the ESP32 response:

```json
{
  "type": "env",
  "sensor": "WAREHOUSE-01",
  "temperature": 28.4,
  "humidity": 42.1,
  "actuatorNonce": 18,
  "actuatorState": "ON",
  "timestamp": 1788460000000
}
```

## Future ESP32 light-client behavior

Future device state:

```cpp
uint64_t lastSeenNonce;
bool actuatorOn;
unsigned long actuatorStartedAt;
```

Conceptual non-blocking loop:

```cpp
chainNonce = readFinalizedTriggerNonceFromPolkadotLightClient();

if (chainNonce > lastSeenNonce) {
  lastSeenNonce = chainNonce;
  relayOn();
  actuatorOn = true;
  actuatorStartedAt = millis();
}

readDht11();
serveSensorEndpoint();
updateTelemetry(lastSeenNonce, actuatorOn ? "ON" : "OFF");

if (actuatorOn && millis() - actuatorStartedAt >= 60000) {
  relayOff();
  actuatorOn = false;
}
```

The firmware must not call `delay(60000)`. It must continue measuring the
environment, serving `/sensor.txt`, and reporting telemetry while the fan is
running.

## Hardware semantics

`ACTUATOR-01` is a 5 V relay-controlled USB ventilation fan connected to the
ESP32. `ON` means the relay and fan are physically on; `OFF` means they are
physically off. The fan blows toward the DHT11 to create a visible feedback
effect in temperature and humidity telemetry.

## Trust boundaries

- Contract `triggerNonce`: a 1 PAS payment created an activation trigger.
- ESP32 `actuatorNonce`: the physical device observed that finalized trigger.
- ESP32 `actuatorState`: the relay/fan is currently `ON` or `OFF`.
- Temperature and humidity: the environment measured by the DHT11.

A contract nonce newer than the ESP32 nonce is a valid diagnostic state. The
frontend displays both values and never infers fan state from payment success.
