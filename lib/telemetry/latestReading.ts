import type { SensorReading } from "./sensorReading";

export type ReceivedReading = SensorReading & { receivedAt: number; signer?: string };

/**
 * Folds an arriving reading into the one on display.
 *
 * Two clocks meet here and they must not be mixed up:
 *
 *   * `timestamp` comes from whoever produced the reading, and decides which
 *     payload is the newer one. Keeping the highest is what stops an
 *     out-of-order delivery from replacing good data with older data.
 *   * `receivedAt` is this device's own clock, and is the only thing the
 *     LIVE / STALE / NO SIGNAL age may be measured against.
 *
 * Selecting by one and ageing by the other is what wedged the gateway: both
 * non-default branches used to carry the previous `receivedAt` forward, so as
 * soon as `latest.timestamp` sat ahead of anything this device would go on to
 * produce or receive - a second of clock skew against another gateway is
 * enough - the age grew without bound and the page showed NO SIGNAL for ever,
 * while publishing and the sensor kept working. Nothing could undo it, because
 * reconnecting does not lower the stored timestamp. Only a reload.
 *
 * So: the payload is still the newest by `timestamp`, but `receivedAt` always
 * moves forward with the arrival. The age then means what it says - how long
 * since anything at all arrived.
 */
export function mergeLatest(
  current: ReceivedReading | null,
  received: ReceivedReading,
): ReceivedReading {
  if (!current) return received;

  if (current.timestamp > received.timestamp) {
    // Older payload, but it is still traffic: keep what is displayed, and let
    // the freshness clock advance.
    return { ...current, receivedAt: Math.max(current.receivedAt, received.receivedAt) };
  }

  if (current.timestamp === received.timestamp) {
    // The same reading coming back from the store after we published it, or a
    // second copy of it. Prefer a signer once one is known.
    return {
      ...received,
      receivedAt: Math.max(current.receivedAt, received.receivedAt),
      signer: received.signer ?? current.signer,
    };
  }

  return received;
}
