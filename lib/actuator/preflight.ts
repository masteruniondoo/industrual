/**
 * Classifies a failed `trigger()` dry run. The dry run runs against the same
 * `ReviveApi.call` the transaction would use, so it sees the caller's real
 * balance without touching the wallet or any storage subscription.
 */
export class ActuatorInsufficientFundsError extends Error {
  constructor() {
    super(
      "Insufficient funds: the account cannot transfer 1 PAS plus fees. " +
        "Top up the wallet with at least 1.3 PAS and try again.",
    );
    this.name = "ActuatorInsufficientFundsError";
  }
}

export class ActuatorPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActuatorPreflightError";
  }
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, (_, item) =>
      typeof item === "bigint" ? item.toString() : item,
    );
  } catch {
    return String(value);
  }
}

function revertReason(value: unknown): string | null {
  if (value && typeof value === "object" && "reason" in value) {
    const reason = (value as { reason?: unknown }).reason;
    if (typeof reason === "string" && reason.length > 0) return reason;
  }
  return null;
}

/**
 * Turns the `value` of a failed dry run into the error the activation should
 * abort with. `TransferFailed` is how pallet-revive reports that the caller
 * cannot pay the value it is trying to send.
 */
export function preflightFailureError(value: unknown): Error {
  if (stringify(value).includes("TransferFailed")) {
    return new ActuatorInsufficientFundsError();
  }
  const reason = revertReason(value);
  if (reason) {
    return new ActuatorPreflightError(`The contract rejected the activation: ${reason}.`);
  }
  return new ActuatorPreflightError(`Activation pre-flight failed: ${stringify(value)}`);
}
