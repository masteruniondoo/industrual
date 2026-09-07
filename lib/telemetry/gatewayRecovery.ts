export type GatewayHealth = {
  /** Statement Store reports a live connection. */
  connected: boolean;
  /** A physical reading exists and the device still stands behind it. */
  hasCurrentReading: boolean;
  /** The host would accept a publish right now. */
  allowedByHost: boolean;
  /** Auto publish is on. */
  autoPublish: boolean;
  /** The operator switched auto publish off deliberately. */
  offByOperator: boolean;
  /** When a publish was last accepted, or null if none yet. */
  lastPublishAt: number | null;
  /** When recovery last acted, so it does not act every tick. */
  lastRecoveryAt: number;
  now: number;
};

export type GatewayRecovery =
  /** Publishing is healthy, or it is silent for a reason the gateway must not override. */
  | "none"
  /** Auto publish is off without the operator having chosen that. Turn it back on. */
  | "rearm"
  /** Armed and healthy but silent. Reopen the heartbeat window and try again. */
  | "reopen";

/** Three heartbeat intervals of silence is the point at which this intervenes. */
export const RECOVERY_AFTER_MS = 30_000;

/**
 * Whether the gateway should repair its own publishing, and how.
 *
 * A successful publish is the only thing that refreshes this device's view of
 * the signal, so when publishing stops the page shows NO SIGNAL and nothing
 * else notices. This deliberately does not try to work out *why* it stopped:
 * the observed failures were a frozen freshness clock, then a retry that became
 * a dead end, then auto publish sitting off with nothing able to turn it back
 * on. Each time the recovery depended on having identified the cause, and each
 * time that was wrong. So this asks only whether the conditions for publishing
 * hold while publishing is not happening.
 *
 * The one silence it will not break is the operator's. Auto publish switched off
 * by hand stays off.
 */
export function decideRecovery(
  health: GatewayHealth,
  afterMs: number = RECOVERY_AFTER_MS,
): GatewayRecovery {
  if (!health.connected || !health.hasCurrentReading || !health.allowedByHost) return "none";
  if (health.offByOperator) return "none";

  const quietSince = Math.max(health.lastPublishAt ?? 0, health.lastRecoveryAt);
  if (health.now - quietSince < afterMs) return "none";

  return health.autoPublish ? "reopen" : "rearm";
}
