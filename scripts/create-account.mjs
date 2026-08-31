import { spawnSync } from "node:child_process";
import {
  cryptoWaitReady,
  encodeAddress,
  mnemonicGenerate,
  mnemonicToMiniSecret,
  sr25519PairFromSeed,
} from "@polkadot/util-crypto";

const ACCOUNT_NAME = "industrial";
const DOMAIN = "industrial.dot";

function runDotns(args, extraEnv = {}) {
  const executable = process.platform === "win32" ? "dotns.cmd" : "dotns";
  return spawnSync(executable, args, {
    env: { ...process.env, ...extraEnv },
    shell: process.platform === "win32",
    stdio: "inherit",
  });
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("Pokreni ovu komandu direktno u svom terminalu zbog sigurnog unosa lozinke.");
  process.exit(1);
}

await cryptoWaitReady();

const mnemonic = mnemonicGenerate(12);
const miniSecret = mnemonicToMiniSecret(mnemonic);
const { publicKey } = sr25519PairFromSeed(miniSecret);
const address = encodeAddress(publicKey, 42);

console.log(`\nKreiranje šifrovanog DotNS naloga '${ACCOUNT_NAME}' za ${DOMAIN}.`);
console.log("Unesi novu, jaku keystore lozinku kada je dotns zatraži.");
console.log("Mnemonic će biti prikazan jednom, tek nakon uspešnog čuvanja naloga.\n");

const saveResult = runDotns(
  ["auth", "set", "--account", ACCOUNT_NAME],
  { DOTNS_MNEMONIC: mnemonic },
);

if (saveResult.error?.code === "ENOENT") {
  console.error("dotns nije instaliran. Instaliraj @polkadot-community-foundation/dotns-cli.");
  process.exit(1);
}

if (saveResult.status !== 0) {
  console.error("Nalog nije sačuvan. Mnemonic iz ovog pokušaja je odbačen.");
  process.exit(saveResult.status ?? 1);
}

const useResult = runDotns(["auth", "use", ACCOUNT_NAME]);
if (useResult.status !== 0) {
  console.error("Nalog je sačuvan, ali nije postavljen kao podrazumevani DotNS nalog.");
  process.exit(useResult.status ?? 1);
}

console.log("\n============================================================");
console.log("RECOVERY MNEMONIC — PREPIŠI GA SADA U PASSWORD MANAGER:");
console.log(mnemonic);
console.log("============================================================");
console.log(`Substrate adresa: ${address}`);
console.log(`Predviđeni domen: ${DOMAIN}`);
console.log("\nMnemonic se više neće prikazati. Ne čuvaj ga u ovom repozitorijumu.");
