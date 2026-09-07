import { describe, expect, it } from "vitest";
import { parseLocalSensorPayload } from "./parseLocalSensorPayload";

describe("parseLocalSensorPayload", () => {
  it("preserves backward compatibility with temperature and humidity", () => {
    expect(parseLocalSensorPayload("T=29.0,H=30.8", 1000)).toEqual({
      ok: true,
      value: {
        sensor: "WAREHOUSE-01",
        temperature: 29,
        humidity: 30.8,
        timestamp: 1000,
        source: "http",
      },
    });
  });

  it.each(["ON", "OFF"] as const)("parses actuator state %s", (actuatorState) => {
    expect(parseLocalSensorPayload(`T=29.0,H=30.8,N=18,S=${actuatorState}`, 1000)).toEqual({
      ok: true,
      value: {
        sensor: "WAREHOUSE-01",
        temperature: 29,
        humidity: 30.8,
        actuatorNonce: 18,
        actuatorState,
        timestamp: 1000,
        source: "http",
      },
    });
  });

  // The firmware keeps the four-field structure and writes NA for a value it
  // does not have. Before a nonce is ever verified it still knows its own GPIO.
  it("accepts an unverified nonce while keeping the reported actuator state", () => {
    expect(parseLocalSensorPayload("T=23.0,H=48.0,N=NA,S=OFF\n", 1000)).toEqual({
      ok: true,
      value: {
        sensor: "WAREHOUSE-01",
        temperature: 23,
        humidity: 48,
        actuatorState: "OFF",
        timestamp: 1000,
        source: "http",
      },
    });
  });

  it("leaves an absent actuator state unknown rather than inferring one", () => {
    expect(parseLocalSensorPayload("T=23.0,H=48.0,N=7,S=NA", 1000)).toEqual({
      ok: true,
      value: {
        sensor: "WAREHOUSE-01",
        temperature: 23,
        humidity: 48,
        actuatorNonce: 7,
        timestamp: 1000,
        source: "http",
      },
    });
  });

  it.each([
    "T=NA,H=NA,N=18,S=ON",
    "T=NA,H=NA,N=NA,S=OFF\n",
    "T=23.0,H=NA,N=18,S=ON",
  ])("reports a missing DHT11 value as no-reading, not malformed: %s", (payload) => {
    const result = parseLocalSensorPayload(payload, 1000);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("no-reading");
  });

  it.each([
    "T=29.0,H=30.8,N=18",
    "T=29.0,H=30.8,S=ON",
    "T=29.0,H=30.8,N=-1,S=ON",
    "T=29.0,H=30.8,N=18,S=ACTIVE",
    "T=29.0,H=30.8,N=18,S=true",
    "T=29.0,H=30.8,N=1.5,S=ON",
    "T=29.0,H=abc,N=18,S=ON",
  ])("rejects malformed actuator payload %s", (payload) => {
    const result = parseLocalSensorPayload(payload);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("malformed");
  });
});
