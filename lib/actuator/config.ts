export const ACTUATOR_PACKAGE_NAME = "@industrial/actuator";
export const ACTUATOR_PRICE_PLANCK = 1_000_000_000_000_000_000n;
export const ACTUATOR_PRICE_LABEL = "1 PAS";
export const ACTUATOR_RUN_SECONDS = 60;
export const ACTUATOR_NETWORK = "Products Devnet / Asset Hub";

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
