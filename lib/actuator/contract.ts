import { getChainAPI } from "@parity/product-sdk-chain-client";
import {
  createContractRuntimeFromClient,
  ensureContractAccountMapped,
  createContract,
} from "@parity/product-sdk-contracts";
import { paseo_asset_hub } from "@parity/product-sdk-descriptors/paseo-asset-hub";
import { SignerManager } from "@parity/product-sdk-signer";
import type { TxStatus } from "@parity/product-sdk-tx";
import { ACTUATOR_ABI } from "./abi";
import {
  ACTUATOR_CONTRACT_ADDRESS,
  ACTUATOR_PRICE_PLANCK,
} from "./config";
import { ActuatorSubmissionLock } from "./submissionLock";

const DOT_NS_IDENTIFIER = "industrial.dot";
const submissionLock = new ActuatorSubmissionLock();

type ActuatorContext = Awaited<ReturnType<typeof createContext>>;
let contextPromise: Promise<ActuatorContext> | null = null;

export type ActuatorTransactionStatus =
  | "connecting"
  | "mapping"
  | "signing"
  | "broadcasting"
  | "in-block"
  | "finalized"
  | "error";

export type TriggerActuatorResult = {
  triggerNonce: bigint;
  transactionHash: string;
};

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

async function createContext() {
  const address = requireContractAddress();
  const chain = await getChainAPI("devnet");
  const runtime = createContractRuntimeFromClient(
    chain.raw.assetHub,
    paseo_asset_hub,
    { at: "finalized" },
  );
  const signerManager = new SignerManager({ dappName: "industrial" });
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

export async function readTriggerNonce(): Promise<bigint> {
  const { contract } = await getContext();
  const result = await contract.triggerNonce.query({ at: "finalized" });
  if (!result.success) {
    throw new Error(`Unable to read triggerNonce: ${sdkErrorMessage(result.value)}`);
  }
  return toBigInt(result.value, "triggerNonce");
}

export async function readPrice(): Promise<bigint> {
  const { contract } = await getContext();
  const result = await contract.PRICE.query({ at: "finalized" });
  if (!result.success) {
    throw new Error(`Unable to read PRICE: ${sdkErrorMessage(result.value)}`);
  }
  return toBigInt(result.value, "PRICE");
}

export async function triggerActuator(
  onStatus?: (status: ActuatorTransactionStatus) => void,
): Promise<TriggerActuatorResult> {
  return submissionLock.run(async () => {
    onStatus?.("connecting");
    const { contract, runtime, signerManager } = await getContext();

    const connected = await signerManager.connect("host");
    if (!connected.ok) throw connected.error;

    const productAccount = await signerManager.getProductAccount(DOT_NS_IDENTIFIER);
    if (!productAccount.ok) throw productAccount.error;

    const signer = productAccount.value.getSigner();
    onStatus?.("mapping");
    const mapping = await ensureContractAccountMapped(
      runtime,
      productAccount.value.address,
      signer,
    );
    if (!mapping.ok) throw mapping.error;

    const configuredPrice = await readPrice();
    if (configuredPrice !== ACTUATOR_PRICE_PLANCK) {
      throw new Error(`Unexpected contract price: ${configuredPrice.toString()}.`);
    }

    const result = await contract.trigger.tx({
      origin: productAccount.value.address,
      signer,
      value: ACTUATOR_PRICE_PLANCK,
      waitFor: "finalized",
      onStatus: (status: TxStatus) => onStatus?.(status),
    });
    if (!result.ok) throw result.error;

    onStatus?.("finalized");
    const triggerNonce = await readTriggerNonce();
    return {
      triggerNonce,
      transactionHash: result.value.txHash,
    };
  });
}
