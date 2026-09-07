import { describe, expect, it } from "vitest";
import { mergeLatest, type ReceivedReading } from "./latestReading";

const base = {
  type: "env",
  sensor: "WAREHOUSE-01",
  temperature: 26.5,
  humidity: 42,
} as const;

function reading(timestamp: number, receivedAt: number, signer?: string): ReceivedReading {
  return { ...base, timestamp, receivedAt, ...(signer === undefined ? {} : { signer }) };
}

const T0 = 1_788_460_000_000;

describe("latest reading on display", () => {
  it("takes the first arrival as-is", () => {
    const first = reading(T0, T0);
    expect(mergeLatest(null, first)).toBe(first);
  });

  it("replaces the payload when a newer reading arrives", () => {
    const merged = mergeLatest(reading(T0, T0), reading(T0 + 1_000, T0 + 1_000));
    expect(merged.timestamp).toBe(T0 + 1_000);
    expect(merged.receivedAt).toBe(T0 + 1_000);
  });

  it("keeps the newer payload when an out-of-order reading arrives", () => {
    const merged = mergeLatest(reading(T0 + 5_000, T0 + 5_000), reading(T0, T0 + 6_000));
    expect(merged.timestamp).toBe(T0 + 5_000);
  });

  // The wedge. A gateway whose clock runs a little ahead publishes a reading
  // this device can never match, and every later arrival takes the "older
  // payload" branch. If that branch carries the old receivedAt forward, the age
  // grows for ever and the page sits at NO SIGNAL with a healthy sensor and a
  // working publisher. Reconnecting cannot fix it; only a reload could.
  it("advances the freshness clock even when the payload is not replaced", () => {
    const fromAFasterClock = reading(T0 + 30_000, T0);
    let latest = fromAFasterClock;

    // Ten seconds of this device's own perfectly good readings.
    for (let i = 1; i <= 10; i++) {
      latest = mergeLatest(latest, reading(T0 + i * 1_000, T0 + i * 1_000));
    }

    expect(latest.timestamp).toBe(T0 + 30_000); // still showing the newest payload
    expect(latest.receivedAt).toBe(T0 + 10_000); // but the age is current
  });

  it("advances the freshness clock when the same reading arrives twice", () => {
    const merged = mergeLatest(reading(T0, T0), reading(T0, T0 + 4_000, "5Grw…"));
    expect(merged.receivedAt).toBe(T0 + 4_000);
    expect(merged.signer).toBe("5Grw…");
  });

  it("keeps a known signer when the echo carries none", () => {
    const merged = mergeLatest(reading(T0, T0, "5Grw…"), reading(T0, T0 + 1_000));
    expect(merged.signer).toBe("5Grw…");
  });

  it("never moves the freshness clock backwards", () => {
    const merged = mergeLatest(reading(T0, T0 + 9_000), reading(T0, T0 + 1_000));
    expect(merged.receivedAt).toBe(T0 + 9_000);
  });
});
