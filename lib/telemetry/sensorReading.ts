import type {
  ActuatorState,
  HttpSensorReading,
} from "../http/parseLocalSensorPayload";

export type SensorReading = {
  type: "env";
  sensor: "WAREHOUSE-01";
  temperature: number;
  humidity: number;
  actuatorNonce?: number;
  actuatorState?: ActuatorState;
  timestamp: number;
};

export function isSensorReading(value: unknown): value is SensorReading {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const hasActuatorNonce = row.actuatorNonce !== undefined;
  const hasActuatorState = row.actuatorState !== undefined;
  const validActuator =
    (!hasActuatorNonce && !hasActuatorState) ||
    (hasActuatorNonce &&
      hasActuatorState &&
      typeof row.actuatorNonce === "number" &&
      Number.isSafeInteger(row.actuatorNonce) &&
      row.actuatorNonce >= 0 &&
      (row.actuatorState === "ON" || row.actuatorState === "OFF"));

  return (
    row.type === "env" &&
    row.sensor === "WAREHOUSE-01" &&
    typeof row.temperature === "number" &&
    Number.isFinite(row.temperature) &&
    typeof row.humidity === "number" &&
    Number.isFinite(row.humidity) &&
    typeof row.timestamp === "number" &&
    Number.isFinite(row.timestamp) &&
    validActuator
  );
}

export function toSensorReading(reading: HttpSensorReading): SensorReading {
  return {
    type: "env",
    sensor: "WAREHOUSE-01",
    temperature: reading.temperature,
    humidity: reading.humidity,
    ...(reading.actuatorNonce === undefined
      ? {}
      : { actuatorNonce: reading.actuatorNonce }),
    ...(reading.actuatorState === undefined
      ? {}
      : { actuatorState: reading.actuatorState }),
    timestamp: reading.timestamp,
  };
}
