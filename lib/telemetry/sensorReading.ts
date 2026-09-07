import type {
  ActuatorState,
  HttpSensorReading,
} from "../http/parseLocalSensorPayload";
import type { PublishReason } from "./publishScheduler";

export type SensorReading = {
  type: "env";
  sensor: "WAREHOUSE-01";
  temperature: number;
  humidity: number;
  actuatorNonce?: number;
  actuatorState?: ActuatorState;
  timestamp: number;
  // Informational only: why this snapshot was sent. Optional on the wire, so a
  // consumer that predates it, or a producer that omits it, is unaffected.
  reason?: string;
};

// The only two fields that make a reading urgent. Both a full SensorReading and
// an HttpSensorReading satisfy this, as does the scheduler's own observed state.
export type ActuatorObservation = {
  actuatorNonce?: number;
  actuatorState?: ActuatorState;
};

/**
 * Whether a snapshot must be published immediately rather than waiting for the
 * next heartbeat.
 *
 * Only the nonce and the actuator state qualify. Temperature and humidity drift
 * continuously and would otherwise make every local poll an event; they are
 * reported on the heartbeat instead.
 */
export function hasImmediatePublishTrigger(
  previous: ActuatorObservation | SensorReading | HttpSensorReading,
  current: ActuatorObservation | SensorReading | HttpSensorReading,
): boolean {
  return previous.actuatorState !== current.actuatorState ||
    previous.actuatorNonce !== current.actuatorNonce;
}

export function isSensorReading(value: unknown): value is SensorReading {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  // The two actuator fields are independent evidence. A device that has not yet
  // verified a trigger nonce still knows its own GPIO state, so a reading may
  // carry either field alone. Absent stays absent and is never inferred.
  const validActuatorNonce =
    row.actuatorNonce === undefined ||
    (typeof row.actuatorNonce === "number" &&
      Number.isSafeInteger(row.actuatorNonce) &&
      row.actuatorNonce >= 0);
  const validActuatorState =
    row.actuatorState === undefined ||
    row.actuatorState === "ON" ||
    row.actuatorState === "OFF";
  // Deliberately permissive: the reason is a label for humans, so an unfamiliar
  // value from a newer producer must not make an otherwise valid reading fail.
  const validReason = row.reason === undefined || typeof row.reason === "string";

  return (
    row.type === "env" &&
    row.sensor === "WAREHOUSE-01" &&
    typeof row.temperature === "number" &&
    Number.isFinite(row.temperature) &&
    typeof row.humidity === "number" &&
    Number.isFinite(row.humidity) &&
    typeof row.timestamp === "number" &&
    Number.isFinite(row.timestamp) &&
    validActuatorNonce &&
    validActuatorState &&
    validReason
  );
}

export function toSensorReading(
  reading: HttpSensorReading,
  reason?: PublishReason | "manual",
): SensorReading {
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
    ...(reason === undefined ? {} : { reason }),
  };
}
