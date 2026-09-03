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

  it.each([
    "T=29.0,H=30.8,N=18",
    "T=29.0,H=30.8,S=ON",
    "T=29.0,H=30.8,N=-1,S=ON",
    "T=29.0,H=30.8,N=18,S=ACTIVE",
    "T=29.0,H=30.8,N=18,S=true",
  ])("rejects malformed actuator payload %s", (payload) => {
    expect(parseLocalSensorPayload(payload).ok).toBe(false);
  });
});
