import { describe, expect, it } from "vitest";
import {
  createObservedState,
  decidePublish,
  HEARTBEAT_INTERVAL_MS,
  type ObservedState,
  type PublishDecision,
} from "./publishScheduler";

type Snapshot = { actuatorNonce?: number; actuatorState?: "ON" | "OFF" };

const START = 1_788_460_000_000;

// Drives the scheduler the way the gateway does: one local poll per second,
// each carrying whatever the ESP32 reported at that moment.
function poll(
  state: ObservedState,
  snapshots: Snapshot[],
  startAt = START,
  stepMs = 1_000,
): PublishDecision[] {
  return snapshots.map((snapshot, index) =>
    decidePublish(state, snapshot, startAt + index * stepMs),
  );
}

function reasons(decisions: PublishDecision[]): string[] {
  return decisions.flatMap((decision) => (decision.publish ? [decision.reason] : []));
}

const OFF_14: Snapshot = { actuatorNonce: 14, actuatorState: "OFF" };
const ON_15: Snapshot = { actuatorNonce: 15, actuatorState: "ON" };
const OFF_15: Snapshot = { actuatorNonce: 15, actuatorState: "OFF" };

describe("Celerity publish scheduling", () => {
  it("treats the first valid snapshot as a baseline, not a change", () => {
    const state = createObservedState();
    // It still publishes, because the heartbeat clock has not started yet - but
    // as a heartbeat, never as a fabricated nonce or actuator event.
    expect(decidePublish(state, OFF_14, START)).toEqual({
      publish: true,
      reason: "heartbeat",
    });
  });

  // 1. Stable OFF for 30 s: heartbeats only.
  it("sends only heartbeats while nothing important changes", () => {
    const state = createObservedState();
    const decisions = poll(state, Array.from({ length: 31 }, () => OFF_14));

    expect(reasons(decisions)).toEqual([
      "heartbeat",
      "heartbeat",
      "heartbeat",
      "heartbeat",
    ]);
    // t=0, 10, 20, 30 - the first is the start-up baseline.
    expect(decisions.flatMap((d, i) => (d.publish ? [i] : []))).toEqual([0, 10, 20, 30]);
  });

  // 2. Payment: nonce steps and the actuator switches on.
  it("publishes immediately when the nonce advances, then confirms on the heartbeat", () => {
    const state = createObservedState();
    const snapshots: Snapshot[] = [
      ...Array.from({ length: 3 }, () => OFF_14),
      ...Array.from({ length: 9 }, () => ON_15),
    ];
    const decisions = poll(state, snapshots);

    expect(decisions[0]).toEqual({ publish: true, reason: "heartbeat" });
    expect(decisions[3]).toEqual({ publish: true, reason: "state-change" });
    expect(decisions[10]).toEqual({ publish: true, reason: "heartbeat" });
    // Nothing between the event and the heartbeat.
    expect(decisions.slice(4, 10).every((d) => !d.publish)).toBe(true);
  });

  // 3. The actuator stays ON for ~60 s: no repeat events.
  it("does not repeat the change event while the actuator stays on", () => {
    const state = createObservedState();
    decidePublish(state, OFF_14, START);
    const decisions = poll(state, Array.from({ length: 60 }, () => ON_15), START + 1_000);

    expect(decisions[0]).toEqual({ publish: true, reason: "state-change" });
    // One event, then nothing but heartbeats for the rest of the pulse: t=10s
    // through t=60s, which is 6 of them.
    const rest = reasons(decisions.slice(1));
    expect(rest).toHaveLength(6);
    expect(rest.every((reason) => reason === "heartbeat")).toBe(true);
  });

  // 4. The 60 s pulse ends. The ESP32 reports OFF; the nonce does not move.
  it("publishes immediately when the actuator switches off", () => {
    const state = createObservedState();
    decidePublish(state, ON_15, START);
    const decisions = poll(state, [ON_15, ON_15, OFF_15, OFF_15], START + 1_000);

    expect(decisions[2]).toEqual({ publish: true, reason: "state-change" });
    expect(decisions[3].publish).toBe(false);
  });

  // 5. Both fields move in the same snapshot: one message, not two.
  it("collapses a simultaneous nonce and actuator change into one publish", () => {
    const state = createObservedState();
    decidePublish(state, OFF_15, START);
    const decisions = poll(state, [{ actuatorNonce: 16, actuatorState: "ON" }], START + 1_000);

    expect(decisions).toEqual([{ publish: true, reason: "state-change" }]);
  });

  // 6. Environmental drift alone is not urgent. The scheduler never sees
  //    temperature or humidity, which is exactly why it cannot react to them.
  it("ignores a temperature-only change until the next heartbeat", () => {
    const state = createObservedState();
    decidePublish(state, OFF_14, START);
    const decisions = poll(state, Array.from({ length: 9 }, () => OFF_14), START + 1_000);

    expect(decisions.every((d) => !d.publish)).toBe(true);
    expect(decidePublish(state, OFF_14, START + 10_000)).toEqual({
      publish: true,
      reason: "heartbeat",
    });
  });

  // 7. A failed local read produces no snapshot at all, so the scheduler is
  //    simply not called. Nothing is invented and no state is reset.
  it("keeps the observed state across a gap in local readings", () => {
    const state = createObservedState();
    decidePublish(state, ON_15, START);
    // ...several failed HTTP reads, no calls...
    const afterOutage = decidePublish(state, ON_15, START + 4_000);

    expect(afterOutage.publish).toBe(false);
    expect(state.actuatorState).toBe("ON");
    expect(state.actuatorNonce).toBe(15);
  });

  it("does not restart the heartbeat clock when an event is published", () => {
    const state = createObservedState();
    decidePublish(state, OFF_14, START);
    // An event at t=3s must not push the heartbeat out to t=13s.
    expect(decidePublish(state, ON_15, START + 3_000)).toEqual({
      publish: true,
      reason: "state-change",
    });
    expect(decidePublish(state, ON_15, START + 10_000)).toEqual({
      publish: true,
      reason: "heartbeat",
    });
  });

  // The point of the event path: an actuator change must not sit and wait for
  // the next 10 s boundary. Checked at the worst possible moment - 1 ms after a
  // heartbeat, so the next scheduled tick is almost a full interval away.
  it("publishes an actuator change on the same snapshot, not on the next tick", () => {
    const state = createObservedState();
    decidePublish(state, OFF_15, START); // heartbeat, clock starts here

    const justAfterHeartbeat = decidePublish(state, ON_15, START + 1);

    expect(justAfterHeartbeat).toEqual({ publish: true, reason: "state-change" });
    // And it really was early: the heartbeat for this window has not come yet.
    expect(state.lastHeartbeatAt).toBe(START);
  });

  // page.tsx checks `publishing` before it calls decidePublish, so a snapshot
  // seen while a submission is in flight is never adopted. This models that: an
  // unevaluated snapshot must not silently consume the change.
  it("does not lose a change that arrived while a publish was in flight", () => {
    const state = createObservedState();
    decidePublish(state, OFF_15, START);

    // ...ESP32 reports ON, but the effect returned early on `publishing`, so
    // decidePublish was not called for that snapshot at all...

    // The submission finishes and the effect re-runs with the same reading.
    expect(decidePublish(state, ON_15, START + 1_200)).toEqual({
      publish: true,
      reason: "state-change",
    });
  });

  it("is a no-op when the same snapshot is evaluated twice", () => {
    const state = createObservedState();
    decidePublish(state, OFF_14, START);
    expect(decidePublish(state, ON_15, START + 1_000).publish).toBe(true);
    // A re-render can retrigger the effect with the reading already handled.
    expect(decidePublish(state, ON_15, START + 1_000).publish).toBe(false);
  });

  it("reports a heartbeat exactly on the interval boundary", () => {
    const state = createObservedState();
    decidePublish(state, OFF_14, START);
    expect(decidePublish(state, OFF_14, START + HEARTBEAT_INTERVAL_MS - 1).publish).toBe(false);
    expect(decidePublish(state, OFF_14, START + HEARTBEAT_INTERVAL_MS).publish).toBe(true);
  });

  it("treats a device that starts reporting a nonce as a real change", () => {
    const state = createObservedState();
    // N=NA,S=OFF - the ESP32 knows its GPIO before it has verified any trigger.
    decidePublish(state, { actuatorState: "OFF" }, START);
    expect(decidePublish(state, { actuatorNonce: 11, actuatorState: "OFF" }, START + 1_000)).toEqual({
      publish: true,
      reason: "state-change",
    });
  });
});
