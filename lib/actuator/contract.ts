import { getChainAPI } from "@parity/product-sdk-chain-client";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import {
  createContractRuntimeFromClient,
  ensureContractAccountMapped,
  createContract,
} from "@parity/product-sdk-contracts";
import { devnet_asset_hub } from "@parity/product-sdk-descriptors/devnet-asset-hub";
import {
  DevProvider,
  HostProvider,
  SignerManager,
  type SignerAccount,
} from "@parity/product-sdk-signer";
import type { TxStatus } from "@parity/product-sdk-tx";
import { ACTUATOR_ABI } from "./abi";
import {
  ACTUATOR_CONTRACT_ADDRESS,
  ACTUATOR_PRICE_EVM,
  ACTUATOR_PRICE_NATIVE,
} from "./config";
import { ActuatorSubmissionLock } from "./submissionLock";


const CONNECTION_TIMEOUT_MS = 30_000;
const READ_TIMEOUT_MS = 60_000;
const MAPPING_TIMEOUT_MS = 90_000;
const ALLOWANCE_TIMEOUT_MS = 60_000;
const TRANSACTION_TIMEOUT_MS = 120_000;
// Outer bound on the whole submission, above the SDK's own timeout so its more
// specific error wins whenever it fires. This only catches a wedged host call.
const SUBMISSION_TIMEOUT_MS = TRANSACTION_TIMEOUT_MS + 30_000;
const DOT_NS_IDENTIFIER = "industrial.dot";
const PUBLIC_ASSET_HUB_URL = "wss://asset-hub-paseo-rpc.n.dwellir.com";
const PUBLIC_READ_ORIGIN = "5Ckonvibt6UtXAoGb5jQycH96xUscfMGzTcuYAJxou48pAN2";
const submissionLock = new ActuatorSubmissionLock();

type ActuatorContext = Awaited<ReturnType<typeof createContext>>;
let contextPromise: Promise<ActuatorContext> | null = null;
let connectedAccountAddress: string | null = null;
// Revive requires a mapping per signing account before it accepts Revive.call.
// ensureContractAccountMapped is idempotent, but it is a chain read plus a
// possible signature, so it runs once per connected account, not per payment.
let mappedAccountAddress: string | null = null;
let publicReadContextPromise: Promise<{
  contract: Awaited<ReturnType<typeof createContext>>["contract"];
  client: ReturnType<typeof createClient>;
}> | null = null;

// The SDK's documented shape. Two things it does that this app used to do by
// hand inside the payment, and that belong here instead:
//
//   * onConnect is where resource allowances go. Per the SDK and the Polkadot
//     docs: "Request the resources your Product needs here, before any signing
//     call is made." It fires once per connection and re-fires after the SDK's
//     own auto-reconnect, which is the recovery path - not a manual reset.
//   * requestChainSubmitPermission defaults to true, so the host grants signing
//     right after connect(). Disabling it only makes sense for an app that
//     drives the prompt itself, which pushed the prompt into the payment click.
//
// ctx.requestResourceAllocation throws instead of returning a Result, so the
// failure surfaces through connect() rather than being silently swallowed.
const signerManager = new SignerManager({
  dappName: "industrial.dot",
  createProvider: (type) =>
    type === "host" ? new HostProvider({ dappName: "industrial.dot" }) : new DevProvider(),
  onConnect: async (_account, { requestResourceAllocation }) => {
    const outcomes = await withTimeout(
      requestResourceAllocation([{ tag: "SmartContractAllowance", value: 0 }]),
      ALLOWANCE_TIMEOUT_MS,
      "smart-contract allowance",
    );
    if (outcomes[0] !== "Allocated") {
      throw new Error(
        "The smart-contract allowance was not granted. Reconnect the wallet and approve it.",
      );
    }
  },
});

export type ActuatorTransactionStatus =
  | "connecting"
  | "signing"
  | "broadcasting"
  | "in-block"
  | "finalized"
  | "error";

export type TriggerActuatorResult = {
  triggerNonce: bigint;
  transactionHash: string;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out after ${ms / 1000}s waiting for the ${label}.`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function requireContractAddress(): `0x${string}` {
  if (!ACTUATOR_CONTRACT_ADDRESS) {
    throw new Error(
      "Actuator contract is not deployed. Configure NEXT_PUBLIC_ACTUATOR_CONTRACT_ADDRESS.",
    );
  }
  return ACTUATOR_CONTRACT_ADDRESS;
}

function toBigInt(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error(`Invalid ${label} returned by the Actuator contract.`);
}

function sdkErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function asActivationError(error: unknown): unknown {
  const message = sdkErrorMessage(error);
  if (message.includes("AccountUnmapped")) {
    return new Error(
      "The wallet account is not mapped for Revive on this network. " +
        "Complete the account mapping in the wallet, then try payment again.",
    );
  }
  if (message.includes("TransferFailed")) {
    return new Error(
      "The chain rejected the payment: the account could not transfer 1 PAS. " +
        "Check the balance and try again.",
    );
  }
  if (/timed?\s*out|timeout/i.test(message)) {
    return new Error(
      "The payment was not finalized within 2 minutes. It may still be processing; " +
        "check the wallet activity before trying again.",
    );
  }
  return error;
}

async function createContext() {
  const address = requireContractAddress();
  const chain = await withTimeout(
    getChainAPI("devnet"),
    CONNECTION_TIMEOUT_MS,
    "Products Devnet connection",
  );
  const runtime = createContractRuntimeFromClient(
    chain.raw.assetHub,
    devnet_asset_hub,
    { at: "finalized" },
  );
  const contract = createContract(runtime, address, ACTUATOR_ABI, {
    signerManager,
  });

  return { chain, contract, runtime, signerManager };
}

async function getContext() {
  contextPromise ??= createContext().catch((error) => {
    contextPromise = null;
    throw error;
  });
  return contextPromise;
}

export function isActuatorContractConfigured() {
  return ACTUATOR_CONTRACT_ADDRESS !== null;
}

// Connecting rebuilds everything, so a socket that died while the app was
// backgrounded does not survive into the next session. The SDK reconnects its
// own provider automatically and re-runs onConnect; this covers the chain
// client, which is ours.
function clearCachedChainState() {
  contextPromise = null;
  mappedAccountAddress = null;
}

async function getPublicReadContext() {
  publicReadContextPromise ??= (async () => {
    const client = createClient(getWsProvider(PUBLIC_ASSET_HUB_URL));
    const runtime = createContractRuntimeFromClient(client, devnet_asset_hub, {
      at: "finalized",
    });
    const contract = createContract(runtime, requireContractAddress(), ACTUATOR_ABI);
    return { contract, client };
  })().catch((error) => {
    publicReadContextPromise = null;
    throw error;
  });
  return publicReadContextPromise;
}

export async function readPublicTriggerNonce(): Promise<bigint> {
  const { contract } = await getPublicReadContext();
  const result = await withTimeout(
    contract.triggerNonce.query({ origin: PUBLIC_READ_ORIGIN, at: "finalized" }),
    READ_TIMEOUT_MS,
    "public triggerNonce read",
  );
  if (!result.success) {
    throw new Error(`Unable to read public triggerNonce: ${sdkErrorMessage(result.value)}`);
  }
  return toBigInt(result.value, "public triggerNonce");
}

export async function connectActuatorWallet(): Promise<string> {
  // Connecting is also the way out of a wedged session, so it must not build on
  // whatever the previous attempt left cached.
  clearCachedChainState();

  const connected = await withTimeout(
    signerManager.connect("host"),
    CONNECTION_TIMEOUT_MS,
    "wallet connection",
  );
  if (!connected.ok) throw connected.error;

  const productAccount = await withTimeout(
    signerManager.getProductAccount(DOT_NS_IDENTIFIER),
    CONNECTION_TIMEOUT_MS,
    "application account",
  );
  if (!productAccount.ok) throw productAccount.error;

  const address = productAccount.value.address;

  // "Call ensureContractAccountMapped once at app boot per signing account -
  // it's idempotent" (@parity/product-sdk-contracts). Doing it here means the
  // payment click is a signature and nothing else; doing it inside the payment
  // is what made the first attempt spend its interaction on setup and fail.
  if (mappedAccountAddress !== address) {
    const { runtime } = await getContext();
    const account = signerManager
      .getState()
      .accounts.find((candidate) => candidate.address === address);
    if (!account) throw new Error("The wallet connected without a usable account.");

    const mapping = await withTimeout(
      ensureContractAccountMapped(runtime, address, account.getSigner(), {
        timeoutMs: MAPPING_TIMEOUT_MS,
      }),
      MAPPING_TIMEOUT_MS,
      "account mapping",
    );
    if (!mapping.ok) throw asActivationError(mapping.error);
    mappedAccountAddress = address;
  }

  connectedAccountAddress = address;
  return address;
}

export async function readTriggerNonce(origin?: string): Promise<bigint> {
  const { contract } = await getContext();
  const result = await withTimeout(
    contract.triggerNonce.query({ origin, at: "finalized" }),
    READ_TIMEOUT_MS,
    "triggerNonce read",
  );
  if (!result.success) {
    throw new Error(`Unable to read triggerNonce: ${sdkErrorMessage(result.value)}`);
  }
  return toBigInt(result.value, "triggerNonce");
}

export async function readPrice(): Promise<bigint> {
  const { contract } = await getContext();
  const result = await withTimeout(
    contract.PRICE.query({ at: "finalized" }),
    READ_TIMEOUT_MS,
    "contract price read",
  );
  if (!result.success) {
    throw new Error(`Unable to read PRICE: ${sdkErrorMessage(result.value)}`);
  }
  return toBigInt(result.value, "PRICE");
}

export async function triggerActuator(
  onStatus?: (status: ActuatorTransactionStatus) => void,
): Promise<TriggerActuatorResult> {
  return submissionLock.run(async () => {
    // No teardown and no setup here. Allowance, signing permission and account
    // mapping were all settled at connect time, so this click produces exactly
    // one host interaction: the signature.
    const { contract } = await getContext();
    const account = signerManager
      .getState()
      .accounts.find((candidate) => candidate.address === connectedAccountAddress);
    if (!account) {
      // The host session changed under us. Forget the address so the panel can
      // fall back to "connect wallet" instead of retrying against a dead one.
      connectedAccountAddress = null;
      throw new Error("Connect the wallet before paying.");
    }

    onStatus?.("connecting");
    const signer = account.getSigner();
    onStatus?.("signing");

    // The SDK takes its own timeout, but an abandoned signature can leave the
    // host request itself outstanding, so bound the whole call as well. Without
    // this the promise never settles and the lock is held for the life of the
    // page. The outer bound is deliberately looser so the SDK's own timeout,
    // which reports far better detail, wins in every normal failure.
    let result;
    try {
      result = await withTimeout(
        contract.trigger.tx({
          origin: account.address,
          signer,
          value: ACTUATOR_PRICE_NATIVE,
          waitFor: "finalized",
          timeoutMs: TRANSACTION_TIMEOUT_MS,
          onStatus: (status: TxStatus) => onStatus?.(status),
        }),
        SUBMISSION_TIMEOUT_MS,
        "payment submission",
      );
    } catch (error) {
      throw asActivationError(error);
    }
    if (!result.ok) throw asActivationError(result.error);

    onStatus?.("finalized");
    const triggerNonce = await withTimeout(
      contract.triggerNonce.query({ origin: account.address, at: "finalized" }),
      READ_TIMEOUT_MS,
      "triggerNonce refresh",
    );
    if (!triggerNonce.success) {
      throw new Error(`Unable to read triggerNonce: ${sdkErrorMessage(triggerNonce.value)}`);
    }
    return {
      triggerNonce: toBigInt(triggerNonce.value, "triggerNonce"),
      transactionHash: result.value.txHash,
    };
  });
}
