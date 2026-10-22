import { spawnSync } from "node:child_process";
import { access, readFile, readdir, stat } from "node:fs/promises";

const DEFAULT_DOMAIN = "industrial.dot";
const DEVNET_ENV = "devnet";
// pad (@parity/polkadot-app-deploy 0.20.x) i dalje u svom `devnet` presetu
// nosi DotNS ugovore povučene u devnet migraciji od 9. 9. 2026. Upis u njih
// prolazi bez greške, ali ga host i dev-dot.li ne vide. Ovaj fajl pregazi
// adrese zvaničnim (docs.polkadotcommunity.foundation/reference/addresses);
// ukloniti kad pad preset bude ispravan.
const ENVIRONMENT_FILE = "scripts/devnet-environment.json";
const requiredFiles = ["out/index.html", "public/industrial-icon.png", ENVIRONMENT_FILE];
const checkOnly = process.argv.includes("--check");
const requestedDomain = process.argv.find(
  (argument) => !argument.startsWith("--") && argument.endsWith(".dot"),
);
const domain = (requestedDomain || process.env.DOT_DOMAIN || DEFAULT_DOMAIN).toLowerCase();

function fail(message) {
  console.error(`Devnet check failed: ${message}`);
  process.exit(1);
}

function runPad(args, capture = false) {
  const executable = process.platform === "win32" ? "pad.cmd" : "pad";
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: capture ? "pipe" : "inherit",
  });

  if (result.error?.code === "ENOENT") {
    fail("'pad' nije instaliran. Instaliraj @parity/polkadot-app-deploy globalno.");
  }

  return result;
}

const majorNodeVersion = Number.parseInt(process.versions.node.split(".")[0], 10);
if (majorNodeVersion < 22) {
  fail(`potreban je Node.js 22 ili noviji (trenutno ${process.versions.node}).`);
}

if (!/^[a-z0-9][a-z0-9-]{8,62}\.dot$/.test(domain)) {
  fail(`neispravan domen '${domain}'. Koristi najmanje 9 malih slova, cifara ili crtica pre .dot.`);
}

for (const file of requiredFiles) {
  try {
    await access(file);
    const details = await stat(file);
    if (!details.isFile() || details.size === 0) fail(`${file} nije ispravan artefakt.`);
  } catch {
    fail(`${file} ne postoji. Prvo pokreni 'npm run build'.`);
  }
}

const html = await readFile("out/index.html", "utf8");
if (!html.includes("/_next/static/")) fail("out/index.html nije Next static export.");

try {
  const chunks = await readdir("out/_next/static/chunks");
  if (!chunks.some((file) => file.endsWith(".js"))) {
    fail("Next client-side JavaScript chunkovi nedostaju.");
  }
} catch {
  fail("out/_next/static/chunks ne postoji. Prvo pokreni 'npm run build'.");
}

const versionResult = runPad(["--version"], true);
if (versionResult.status !== 0) {
  fail("nije moguće pokrenuti 'pad --version'. Proveri instalaciju CLI alata.");
}

console.log(`Devnet preflight OK: ${domain}, Next static export, ${versionResult.stdout.trim()}`);

if (checkOnly) process.exit(0);

const hasMnemonic = Boolean(process.env.MNEMONIC?.trim());

if (!hasMnemonic) {
  const identityResult = runPad(["whoami"], true);
  if (identityResult.status !== 0) {
    fail("nema aktivne wallet sesije. Pokreni 'npm run login:devnet' ili koristi secure deploy.");
  }
  if (identityResult.stdout.trim()) console.log(identityResult.stdout.trim());
}

const deployArgs = [
  "./out",
  domain,
  "--env",
  DEVNET_ENV,
  "--environment-file",
  ENVIRONMENT_FILE,
  "--js-merkle",
  "--config",
  "./polkadot-app-deploy.config.ts",
];

// pad 0.20 više nema --publish (Browse/Publisher upis); nepoznat flag bi samo
// tiho ignorisao. Vlasnik imena potpisuje preko MNEMONIC ili wallet sesije.
if (!hasMnemonic) {
  console.warn(
    "Upozorenje: bez MNEMONIC promenljive deploy potpisuje pad wallet sesija. Za potpis vlasnikom koristi 'npm run deploy:devnet:secure'.",
  );
}

console.log(`Deploying ./out to ${domain} on Products Devnet...`);
const deployResult = runPad(deployArgs);
process.exit(deployResult.status ?? 1);
