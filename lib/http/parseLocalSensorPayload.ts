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
  | { ok: false; error: string };

const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export function parseLocalSensorPayload(
  payload: string,
  timestamp = Date.now(),
): ParseLocalSensorResult {
  const fields = payload.trim().split(",");
  if (fields.length !== 2 && fields.length !== 4) {
    return { ok: false, error: `Malformed sensor payload: "${payload}"` };
  }

  const values = new Map<string, string>();

  for (const field of fields) {
    const parts = field.split("=");
    if (parts.length !== 2) {
      return { ok: false, error: `Malformed sensor payload: "${payload}"` };
    }

    const key = parts[0].trim().toUpperCase();
    const valueText = parts[1].trim();

    if (!(["T", "H", "N", "S"] as const).includes(key as "T" | "H" | "N" | "S") || values.has(key)) {
      return { ok: false, error: `Malformed sensor payload: "${payload}"` };
    }

    values.set(key, valueText);
  }

  const temperatureText = values.get("T");
  const humidityText = values.get("H");

  if (
    temperatureText === undefined ||
    humidityText === undefined ||
    !NUMBER_PATTERN.test(temperatureText) ||
    !NUMBER_PATTERN.test(humidityText)
  ) {
    return { ok: false, error: `Payload must contain T and H values: "${payload}"` };
  }

  const temperature = Number(temperatureText);
  const humidity = Number(humidityText);
  if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) {
    return { ok: false, error: `Sensor value is not finite: "${payload}"` };
  }

  const nonceText = values.get("N");
  const stateText = values.get("S");
  if ((nonceText === undefined) !== (stateText === undefined)) {
    return { ok: false, error: `Payload must contain both N and S values: "${payload}"` };
  }

  let actuatorNonce: number | undefined;
  let actuatorState: ActuatorState | undefined;
  if (nonceText !== undefined && stateText !== undefined) {
    if (!/^\d+$/.test(nonceText)) {
      return { ok: false, error: `Actuator nonce must be a non-negative integer: "${payload}"` };
    }

    actuatorNonce = Number(nonceText);
    if (!Number.isSafeInteger(actuatorNonce)) {
      return { ok: false, error: `Actuator nonce is outside the safe integer range: "${payload}"` };
    }

    if (stateText !== "ON" && stateText !== "OFF") {
      return { ok: false, error: `Actuator state must be ON or OFF: "${payload}"` };
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
