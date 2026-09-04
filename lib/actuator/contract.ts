import { getChainAPI } from "@parity/product-sdk-chain-client";
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
import { requestPermission, requestResourceAllocation } from "@parity/product-sdk-host";
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
const DOT_NS_IDENTIFIER = "industrial.dot";
const submissionLock = new ActuatorSubmissionLock();

type ActuatorContext = Awaited<ReturnType<typeof createContext>>;
let contextPromise: Promise<ActuatorContext> | null = null;
let connectedAccountAddress: string | null = null;
let chainSubmitPermissionVerified = false;

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

async function requestSigningPermission() {
  if (chainSubmitPermissionVerified) return;
  const permission = await withTimeout(
    requestPermission({ tag: "ChainSubmit", value: undefined }),
    CONNECTION_TIMEOUT_MS,
    "wallet signing permission",
  );
  if (!permission.ok) throw permission.error;
  if (!permission.value) {
    throw new Error("Wallet signing permission was denied.");
  }
  chainSubmitPermissionVerified = true;
}

async function ensureSmartContractAllowance(address: string) {
  const allocation = await withTimeout(
    requestResourceAllocation([{ tag: "SmartContractAllowance", value: 0 }]),
    ALLOWANCE_TIMEOUT_MS,
    "smart-contract allowance",
  );
  if (!allocation.ok) throw allocation.error;
  const outcome = allocation.value[0];
  if (outcome !== "Allocated") {
    throw new Error(`Smart-contract allowance is not available for ${address}.`);
  }
}

async function createContext() {
  const address = requireContractAddress();
  const signerManager = new SignerManager({
    dappName: "industrial.dot",
    createProvider: (type) =>
      type === "host"
        ? new HostProvider({
            dappName: "industrial.dot",
            requestChainSubmitPermission: false,
          })
        : new DevProvider(),
  });
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

export async function connectActuatorWallet(): Promise<string> {
  const { signerManager } = await getContext();
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

  connectedAccountAddress = productAccount.value.address;
  chainSubmitPermissionVerified = false;
  return productAccount.value.address;
}

export async function readTriggerNonce(): Promise<bigint> {
  const { contract } = await getContext();
  const result = await withTimeout(
    contract.triggerNonce.query({ at: "finalized" }),
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
    const { contract, runtime, signerManager } = await getContext();
    const account = signerManager
      .getState()
      .accounts.find((candidate) => candidate.address === connectedAccountAddress);
    if (!account) {
      throw new Error("Connect the wallet before paying.");
    }

    onStatus?.("connecting");
    await ensureSmartContractAllowance(account.address);
    await requestSigningPermission();

    const signer = account.getSigner();
    onStatus?.("signing");
    const mapping = await withTimeout(
      ensureContractAccountMapped(runtime, account.address, signer, {
        timeoutMs: MAPPING_TIMEOUT_MS,
      }),
      MAPPING_TIMEOUT_MS,
      "account mapping",
    );
    if (!mapping.ok) throw mapping.error;

    const result = await contract.trigger.tx({
      origin: account.address,
      signer,
      value: ACTUATOR_PRICE_NATIVE,
      waitFor: "finalized",
      timeoutMs: TRANSACTION_TIMEOUT_MS,
      onStatus: (status: TxStatus) => onStatus?.(status),
    });
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
