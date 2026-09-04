/**
 * Direct deployment of the Actuator contract to the Products Devnet
 * (Paseo Asset Hub, para ID 1000, pallet-revive / PolkaVM).
 *
 * This performs `Revive.instantiate_with_code` only. It deliberately skips the
 * CDM `publishLatest` registration step: the ContractRegistry deployed on the
 * devnet (0x59b0245778917af55224e5f8fb55f7f8d452619f) currently traps when a
 * new package name is inserted, which makes the atomic `cdm deploy` batch fail
 * with `Revive.ContractTrapped`. See docs/ACTUATOR.md.
 *
 * The deployer key is read from the local CDM keystore (~/.cdm/accounts.json)
 * or from the CDM_MNEMONIC environment variable. It is never printed, logged
 * or written anywhere by this script.
 *
 *   node scripts/deploy-actuator-contract.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Binary, createClient } from "polkadot-api";
import { getPolkadotSigner } from "polkadot-api/signer";
import { getWsProvider } from "polkadot-api/ws";
import { devnet_asset_hub } from "@parity/product-sdk-descriptors/devnet-asset-hub";
import {
  cryptoWaitReady,
  encodeAddress,
  mnemonicToMiniSecret,
  sr25519PairFromSeed,
  sr25519Sign,
} from "@polkadot/util-crypto";

const ASSET_HUB_URL = "wss://asset-hub-paseo-rpc.n.dwellir.com";
const BYTECODE_PATH = resolve("contract/target/cdm/hardhat/_industrial_actuator.polkavm");
const OUTPUT_PATH = resolve("contract/target/actuator-deployment.json");
const DRY_RUN = process.argv.includes("--dry-run");

function loadDeployer() {
  const fromEnv = process.env.CDM_MNEMONIC ?? process.env.MNEMONIC;
  if (fromEnv) return { mnemonic: fromEnv.trim(), address: null };
  const path = resolve(homedir(), ".cdm/accounts.json");
  const accounts = JSON.parse(readFileSync(path, "utf8"));
  const account = accounts.devnet;
  if (!account?.mnemonic) {
    throw new Error(`No devnet account in ${path}. Run "cdm init -n devnet" first.`);
  }
  return { mnemonic: account.mnemonic, address: account.address ?? null };
}

function withBuffer(weight, percent) {
  const scale = (value) => (value * BigInt(100 + percent)) / 100n;
  return { ref_time: scale(weight.ref_time), proof_size: scale(weight.proof_size) };
}

const main = async () => {
  await cryptoWaitReady();

  const code = readFileSync(BYTECODE_PATH);
  if (code.subarray(0, 4).toString("latin1") !== "PVM\0") {
    throw new Error(`${BYTECODE_PATH} is not a PolkaVM blob. Run "cdm build -n devnet" first.`);
  }

  const deployer = loadDeployer();
  const pair = sr25519PairFromSeed(mnemonicToMiniSecret(deployer.mnemonic));
  const origin = encodeAddress(pair.publicKey, 42);
  if (deployer.address && deployer.address !== origin) {
    throw new Error(
      `Derived address ${origin} does not match the keystore address ${deployer.address}.`,
    );
  }
  const signer = getPolkadotSigner(pair.publicKey, "Sr25519", (input) =>
    sr25519Sign(input, pair),
  );

  const client = createClient(getWsProvider(ASSET_HUB_URL));
  const api = client.getTypedApi(devnet_asset_hub);
  const spec = await client.getChainSpecData();
  const decimals = spec.properties?.tokenDecimals ?? 10;
  const symbol = spec.properties?.tokenSymbol ?? "PAS";
  const format = (planck) => `${(Number(planck) / 10 ** decimals).toFixed(4)} ${symbol}`;

  console.log(`  Chain       ${spec.name}`);
  console.log(`  Deployer    ${origin}`);
  const { data: balance } = await api.query.System.Account.getValue(origin);
  console.log(`  Balance     ${format(balance.free)}`);
  console.log(`  Bytecode    ${code.length} bytes`);

  const codeArg = { type: "Upload", value: Binary.fromHex(`0x${code.toString("hex")}`) };
  const dryRun = await api.apis.ReviveApi.instantiate(
    origin,
    0n,
    undefined,
    undefined,
    codeArg,
    Binary.fromHex("0x"),
    undefined,
  );
  if (!dryRun.result.success) {
    throw new Error(`Dry run failed: ${JSON.stringify(dryRun.result, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  }

  const storageDeposit =
    dryRun.storage_deposit.type === "Charge"
      ? (dryRun.storage_deposit.value * 120n) / 100n
      : 0n;
  const weightLimit = withBuffer(dryRun.weight_required, 20);
  console.log(`  Predicted   ${dryRun.result.value.addr}`);
  console.log(`  Deposit     ${format(storageDeposit)} (with 20% buffer)`);

  if (DRY_RUN) {
    console.log("\n  --dry-run: nothing submitted.");
    client.destroy();
    return;
  }

  try {
    await api.tx.Revive.map_account().signAndSubmit(signer);
    console.log("  Mapping     account mapped");
  } catch {
    console.log("  Mapping     already mapped");
  }

  console.log("\n  Submitting Revive.instantiate_with_code ...");
  const result = await api.tx.Revive.instantiate_with_code({
    value: 0n,
    weight_limit: weightLimit,
    storage_deposit_limit: storageDeposit,
    code: Binary.fromHex(`0x${code.toString("hex")}`),
    data: Binary.fromHex("0x"),
    salt: undefined,
  }).signAndSubmit(signer);

  if (!result.ok) {
    throw new Error(
      `Deployment failed: ${JSON.stringify(result.dispatchError, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  }

  const [instantiated] = api.event.Revive.Instantiated.filter(result.events);
  if (!instantiated) throw new Error("No Revive.Instantiated event in the finalized block.");

  const deployment = {
    package: "@industrial/actuator",
    contract: "Actuator",
    address: instantiated.payload?.contract ?? instantiated.contract,
    deployer: origin,
    chain: spec.name,
    paraId: 1000,
    evmChainId: 420420417,
    transactionHash: result.txHash,
    blockHash: result.block.hash,
    blockNumber: result.block.number,
    registered: false,
    registryNote:
      "CDM publishLatest skipped: devnet ContractRegistry 0x59b0245778917af55224e5f8fb55f7f8d452619f traps on new package names.",
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(deployment, null, 2)}\n`);

  console.log(`\n  Address     ${deployment.address}`);
  console.log(`  Tx          ${deployment.transactionHash}`);
  console.log(`  Block       #${deployment.blockNumber} ${deployment.blockHash}`);
  console.log(`  Written to  ${OUTPUT_PATH}`);
  console.log(`\n  Add to .env.local:\n    NEXT_PUBLIC_ACTUATOR_CONTRACT_ADDRESS=${deployment.address}`);
  client.destroy();
};

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`\n  ERROR ${error?.message ?? error}`);
    process.exit(1);
  },
);
