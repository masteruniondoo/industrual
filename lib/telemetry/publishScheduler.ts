import type { ActuatorState } from "../http/parseLocalSensorPayload";
import { hasImmediatePublishTrigger, type ActuatorObservation } from "./sensorReading";

// How often the gateway republishes the complete state regardless of change.
export const HEARTBEAT_INTERVAL_MS = 10_000;

export type PublishReason = "state-change" | "heartbeat";

// What the observer layer has to remember between local polls. The nonce and
// the actuator state are the only two fields that make a reading urgent;
// temperature and humidity ride along on the next heartbeat.
export type ObservedState = {
  actuatorNonce?: number;
  actuatorState?: ActuatorState;
  // Undefined until the first valid snapshot. Distinguishes "no previous value
  // yet" from "previous value was absent", so start-up never looks like a
  // change.
  hasBaseline: boolean;
  // Only ever advanced by an actual heartbeat, so an event in between does not
  // delay or reschedule the next one.
  lastHeartbeatAt?: number;
};

export type PublishDecision =
  | { publish: false }
  | { publish: true; reason: PublishReason };

export function createObservedState(): ObservedState {
  return { hasBaseline: false };
}

/**
 * Decides what a single local snapshot should produce, and adopts it.
 *
 * Mutates `state`: the newest observation is always recorded, whether or not it
 * is published, so the next poll with the same values produces nothing. That
 * also makes a repeated call for the same snapshot a no-op, which matters
 * because the publishing effect can re-run after an unrelated render.
 *
 * A due heartbeat and a state change arriving in the same snapshot are one
 * message, never two: the payload carries the complete current state either way.
 */
export function decidePublish(
  state: ObservedState,
  snapshot: ActuatorObservation,
  now: number,
  intervalMs: number = HEARTBEAT_INTERVAL_MS,
): PublishDecision {
  const previous: ActuatorObservation = {
    actuatorNonce: state.actuatorNonce,
    actuatorState: state.actuatorState,
  };
  const hadBaseline = state.hasBaseline;

  state.actuatorNonce = snapshot.actuatorNonce;
  state.actuatorState = snapshot.actuatorState;
  state.hasBaseline = true;

  // The first valid snapshot is a baseline. There is no earlier value for it to
  // differ from, so it must not be reported as a nonce or actuator change.
  const changed = hadBaseline && hasImmediatePublishTrigger(previous, snapshot);

  const heartbeatDue =
    state.lastHeartbeatAt === undefined || now - state.lastHeartbeatAt >= intervalMs;

  if (!changed && !heartbeatDue) return { publish: false };

  if (heartbeatDue) state.lastHeartbeatAt = now;

  // A change is the more informative label when both apply; the heartbeat clock
  // has already been restarted above either way.
  return { publish: true, reason: changed ? "state-change" : "heartbeat" };
}
