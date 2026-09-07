import { describe, expect, it } from "vitest";
import { decideRecovery, RECOVERY_AFTER_MS, type GatewayHealth } from "./gatewayRecovery";

const T0 = 1_788_460_000_000;

// A gateway that is connected, reading, allowed, armed and publishing normally.
const healthy: GatewayHealth = {
  connected: true,
  hasCurrentReading: true,
  allowedByHost: true,
  autoPublish: true,
  offByOperator: false,
  lastPublishAt: T0,
  lastRecoveryAt: T0,
  now: T0 + 1_000,
};

function after(seconds: number, overrides: Partial<GatewayHealth> = {}): GatewayHealth {
  return { ...healthy, now: T0 + seconds * 1_000, ...overrides };
}

describe("gateway self-recovery", () => {
  it("does nothing while publishing is keeping up", () => {
    expect(decideRecovery(healthy)).toBe("none");
    expect(decideRecovery(after(29))).toBe("none");
  });

  it("reopens the heartbeat after three intervals of silence", () => {
    expect(decideRecovery(after(30))).toBe("reopen");
  });

  // The reported case: everything healthy, auto publish off, and nothing in the
  // app able to turn it back on. The operator had to click PUBLISH CURRENT
  // READING and then AUTO PUBLISH by hand.
  it("re-arms auto publish when it is off and nobody chose that", () => {
    expect(decideRecovery(after(30, { autoPublish: false }))).toBe("rearm");
  });

  it("leaves auto publish alone when the operator switched it off", () => {
    expect(
      decideRecovery(after(300, { autoPublish: false, offByOperator: true })),
    ).toBe("none");
    // Even while armed, an operator-chosen pause is not something to override.
    expect(decideRecovery(after(300, { offByOperator: true }))).toBe("none");
  });

  it.each([
    ["disconnected", { connected: false }],
    ["no current reading", { hasCurrentReading: false }],
    ["allowance withheld", { allowedByHost: false }],
  ])("does not act when %s, because publishing could not succeed anyway", (_label, broken) => {
    expect(decideRecovery(after(300, broken))).toBe("none");
  });

  it("waits again after acting, so it cannot fire every tick", () => {
    const acted = after(30);
    expect(decideRecovery(acted)).toBe("reopen");

    const justAfter: GatewayHealth = { ...acted, lastRecoveryAt: acted.now, now: acted.now + 5_000 };
    expect(decideRecovery(justAfter)).toBe("none");
    expect(decideRecovery({ ...justAfter, now: acted.now + RECOVERY_AFTER_MS })).toBe("reopen");
  });

  it("counts silence from the last publish even when recovery ran earlier", () => {
    // Recovery acted, then a publish succeeded: the clock restarts from the
    // publish, not from the older recovery.
    const published = after(60, { lastRecoveryAt: T0 + 30_000, lastPublishAt: T0 + 55_000 });
    expect(decideRecovery(published)).toBe("none");
  });

  it("treats a gateway that has never published as silent from its last check", () => {
    expect(decideRecovery(after(30, { lastPublishAt: null }))).toBe("reopen");
    expect(decideRecovery(after(10, { lastPublishAt: null }))).toBe("none");
  });
});
