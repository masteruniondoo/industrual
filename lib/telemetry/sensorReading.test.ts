import { describe, expect, it } from "vitest";
import { isSensorReading, toSensorReading } from "./sensorReading";

const base = {
  type: "env",
  sensor: "WAREHOUSE-01",
  temperature: 28.4,
  humidity: 42.1,
  timestamp: 1_788_460_000_000,
} as const;

describe("Warehouse Celerity telemetry", () => {
  it("keeps existing environmental telemetry valid", () => {
    expect(isSensorReading(base)).toBe(true);
  });

  it.each(["ON", "OFF"] as const)("accepts exact actuator state %s", (actuatorState) => {
    expect(isSensorReading({ ...base, actuatorNonce: 18, actuatorState })).toBe(true);
  });

  // Either field may stand alone: an ESP32 that has not verified a nonce yet
  // still reports the GPIO state it is actually driving.
  it.each([
    { ...base, actuatorNonce: 18 },
    { ...base, actuatorState: "ON" },
    { ...base, actuatorState: "OFF" },
  ])("accepts partial actuator evidence", (reading) => {
    expect(isSensorReading(reading)).toBe(true);
  });

  it.each([
    { ...base, actuatorNonce: 18, actuatorState: "ACTIVE" },
    { ...base, actuatorNonce: -1, actuatorState: "OFF" },
    { ...base, actuatorNonce: 1.5, actuatorState: "OFF" },
    { ...base, actuatorNonce: "18", actuatorState: "ON" },
  ])("rejects invalid actuator telemetry", (reading) => {
    expect(isSensorReading(reading)).toBe(false);
  });

  it("forwards physical actuator evidence from the ESP32 reading", () => {
    expect(toSensorReading({
      sensor: "WAREHOUSE-01",
      temperature: 28.4,
      humidity: 42.1,
      actuatorNonce: 18,
      actuatorState: "ON",
      timestamp: 1_788_460_000_000,
      source: "http",
    })).toEqual({ ...base, actuatorNonce: 18, actuatorState: "ON" });
  });
});
