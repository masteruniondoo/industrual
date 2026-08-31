export interface HttpSensorReading {
  sensor: "WAREHOUSE-01";
  temperature: number;
  humidity: number;
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
  if (fields.length !== 2) {
    return { ok: false, error: `Malformed sensor payload: "${payload}"` };
  }

  const values = new Map<"T" | "H", number>();

  for (const field of fields) {
    const parts = field.split("=");
    if (parts.length !== 2) {
      return { ok: false, error: `Malformed sensor payload: "${payload}"` };
    }

    const key = parts[0].trim().toUpperCase();
    const valueText = parts[1].trim();

    if (
      (key !== "T" && key !== "H") ||
      values.has(key) ||
      !NUMBER_PATTERN.test(valueText)
    ) {
      return { ok: false, error: `Malformed sensor payload: "${payload}"` };
    }

    const value = Number(valueText);
    if (!Number.isFinite(value)) {
      return { ok: false, error: `Sensor value is not finite: "${payload}"` };
    }

    values.set(key, value);
  }

  const temperature = values.get("T");
  const humidity = values.get("H");

  if (temperature === undefined || humidity === undefined) {
    return { ok: false, error: `Payload must contain T and H values: "${payload}"` };
  }

  return {
    ok: true,
    value: {
      sensor: "WAREHOUSE-01",
      temperature,
      humidity,
      timestamp,
      source: "http",
    },
  };
}
