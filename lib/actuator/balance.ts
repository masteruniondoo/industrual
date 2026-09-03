import { ACTUATOR_NATIVE_DECIMALS } from "./config";

export type AccountBalance = {
  free: bigint;
  frozen: bigint;
};

export class ActuatorInsufficientFundsError extends Error {
  readonly spendable: bigint;
  readonly required: bigint;

  constructor(spendable: bigint, required: bigint) {
    super(
      `Insufficient funds: ${formatNative(spendable)} available, ` +
        `${formatNative(required)} required (1 PAS payment plus fees and the ` +
        `existential deposit). Top up the account and try again.`,
    );
    this.name = "ActuatorInsufficientFundsError";
    this.spendable = spendable;
    this.required = required;
  }
}

/** Formats native planck as a human PAS amount. */
export function formatNative(planck: bigint): string {
  const scale = 10n ** BigInt(ACTUATOR_NATIVE_DECIMALS);
  const whole = planck / scale;
  const fraction = (planck % scale).toString().padStart(ACTUATOR_NATIVE_DECIMALS, "0");
  return `${whole.toString()}.${fraction.slice(0, 4)} PAS`;
}

/** Balance the account may actually spend: free funds that are not locked. */
export function spendableBalance(balance: AccountBalance): bigint {
  const spendable = balance.free - balance.frozen;
  return spendable > 0n ? spendable : 0n;
}

/**
 * The payment itself, plus head-room for the extrinsic fee and storage deposit,
 * plus the existential deposit that has to stay behind so the account survives.
 */
export function requiredBalance(
  price: bigint,
  feeBuffer: bigint,
  existentialDeposit: bigint,
): bigint {
  return price + feeBuffer + existentialDeposit;
}

/**
 * Throws before anything is signed or submitted when the account cannot cover
 * the activation. Without this the chain rejects the call with
 * `Revive.TransferFailed` only after the user has already signed.
 */
export function assertSufficientBalance(
  balance: AccountBalance,
  price: bigint,
  feeBuffer: bigint,
  existentialDeposit: bigint,
): void {
  const spendable = spendableBalance(balance);
  const required = requiredBalance(price, feeBuffer, existentialDeposit);
  if (spendable < required) {
    throw new ActuatorInsufficientFundsError(spendable, required);
  }
}
