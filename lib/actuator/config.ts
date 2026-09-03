export const ACTUATOR_PACKAGE_NAME = "@industrial/actuator";
export const ACTUATOR_PRICE_LABEL = "1 PAS";
export const ACTUATOR_RUN_SECONDS = 60;
export const ACTUATOR_NETWORK = "Products Devnet / Asset Hub";

/**
 * `Actuator.PRICE` as Solidity sees it. pallet-revive scales the native balance
 * up to 18 decimals before exposing it as `msg.value`, so the contract constant
 * is 1e18 for one PAS.
 */
export const ACTUATOR_PRICE_EVM = 1_000_000_000_000_000_000n;

/** PAS has 10 decimals on Asset Hub. */
export const ACTUATOR_NATIVE_DECIMALS = 10;

/**
 * The value carried by the `Revive.call` extrinsic, in native planck. This is
 * NOT the same number as the contract's PRICE: sending 1e18 planck would ask
 * the chain to transfer 100,000,000 PAS and fails with `Revive.TransferFailed`.
 */
export const ACTUATOR_PRICE_NATIVE = evmValueToNative(
  ACTUATOR_PRICE_EVM,
  ACTUATOR_NATIVE_DECIMALS,
);

/**
 * Head-room kept aside for the extrinsic fee and the contract's storage
 * deposit when checking whether an account can afford an activation.
 * 0.2 PAS is far above the observed cost of a `trigger()` call.
 */
export const ACTUATOR_FEE_BUFFER_NATIVE = 2_000_000_000n;

/**
 * Converts a Solidity-side value (18 decimals) into the native chain balance
 * the extrinsic must carry.
 */
export function evmValueToNative(evmValue: bigint, decimals: number): bigint {
  if (decimals < 0 || decimals > 18) {
    throw new Error(`Unsupported native decimals: ${decimals}.`);
  }
  const scale = 10n ** BigInt(18 - decimals);
  if (evmValue % scale !== 0n) {
    throw new Error(
      `Value ${evmValue.toString()} is not representable with ${decimals} native decimals.`,
    );
  }
  return evmValue / scale;
}

/**
 * Deployed on Products Devnet (Paseo Asset Hub, para ID 1000) on 2026-09-03,
 * block #13024785. Override with NEXT_PUBLIC_ACTUATOR_CONTRACT_ADDRESS when
 * pointing the app at a different deployment.
 */
const DEFAULT_ADDRESS = "0x0863b94ecffca8bca83306cda06b07a9dfef3374";

const configuredAddress =
  process.env.NEXT_PUBLIC_ACTUATOR_CONTRACT_ADDRESS ?? DEFAULT_ADDRESS;

export const ACTUATOR_CONTRACT_ADDRESS =
  configuredAddress && /^0x[0-9a-fA-F]{40}$/.test(configuredAddress)
    ? (configuredAddress as `0x${string}`)
    : null;
