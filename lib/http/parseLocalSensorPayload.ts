export type ActuatorState = "ON" | "OFF";

export interface HttpSensorReading {
  sensor: "WAREHOUSE-01";
  temperature: number;
  humidity: number;
  actuatorNonce?: number;
  actuatorState?: ActuatorState;
  timestamp: number;
  source: "http";
}

export type ParseLocalSensorResult =
  | { ok: true; value: HttpSensorReading }
  // The device answered correctly but has no environmental value right now.
  // That is a device state, not a broken gateway: skip the cycle, keep polling.
  | { ok: false; reason: "no-reading"; error: string }
  | { ok: false; reason: "malformed"; error: string };

const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

// The firmware always emits four fields and writes this literal for a value it
// does not have, rather than dropping the field or inventing a number.
// See experiments/esp32-actuator-verifier/src/monitor_http.cpp (handleSensorTxt).
const ABSENT = "NA";

function malformed(payload: string, detail?: string): ParseLocalSensorResult {
  return {
    ok: false,
    reason: "malformed",
    error: detail ?? `Malformed sensor payload: "${payload}"`,
  };
}

export function parseLocalSensorPayload(
  payload: string,
  timestamp = Date.now(),
): ParseLocalSensorResult {
  const fields = payload.trim().split(",");
  if (fields.length !== 2 && fields.length !== 4) {
    return malformed(payload);
  }

  const values = new Map<string, string>();

  for (const field of fields) {
    const parts = field.split("=");
    if (parts.length !== 2) {
      return malformed(payload);
    }

    const key = parts[0].trim().toUpperCase();
    const valueText = parts[1].trim();

    if (!(["T", "H", "N", "S"] as const).includes(key as "T" | "H" | "N" | "S") || values.has(key)) {
      return malformed(payload);
    }

    values.set(key, valueText);
  }

  const temperatureText = values.get("T");
  const humidityText = values.get("H");

  if (temperatureText === undefined || humidityText === undefined) {
    return malformed(payload, `Payload must contain T and H values: "${payload}"`);
  }

  // A missing DHT11 value is reported, never fabricated. There is nothing to
  // publish this cycle, but the device itself is healthy and still reachable.
  if (temperatureText === ABSENT || humidityText === ABSENT) {
    return {
      ok: false,
      reason: "no-reading",
      error: `Sensor reported no environmental reading: "${payload}"`,
    };
  }

  if (!NUMBER_PATTERN.test(temperatureText) || !NUMBER_PATTERN.test(humidityText)) {
    return malformed(payload, `Payload must contain T and H values: "${payload}"`);
  }

  const temperature = Number(temperatureText);
  const humidity = Number(humidityText);
  if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) {
    return malformed(payload, `Sensor value is not finite: "${payload}"`);
  }

  // N and S are independent. The device knows its own GPIO state long before it
  // has verified any trigger nonce, so "N=NA,S=OFF" is a real reportable state.
  const nonceText = values.get("N");
  const stateText = values.get("S");

  let actuatorNonce: number | undefined;
  if (nonceText !== undefined && nonceText !== ABSENT) {
    if (!/^\d+$/.test(nonceText)) {
      return malformed(payload, `Actuator nonce must be a non-negative integer: "${payload}"`);
    }

    actuatorNonce = Number(nonceText);
    if (!Number.isSafeInteger(actuatorNonce)) {
      return malformed(payload, `Actuator nonce is outside the safe integer range: "${payload}"`);
    }
  }

  let actuatorState: ActuatorState | undefined;
  if (stateText !== undefined && stateText !== ABSENT) {
    if (stateText !== "ON" && stateText !== "OFF") {
      return malformed(payload, `Actuator state must be ON or OFF: "${payload}"`);
    }
    actuatorState = stateText;
  }

  return {
    ok: true,
    value: {
      sensor: "WAREHOUSE-01",
      temperature,
      humidity,
      ...(actuatorNonce === undefined ? {} : { actuatorNonce }),
      ...(actuatorState === undefined ? {} : { actuatorState }),
      timestamp,
      source: "http",
    },
  };
}
