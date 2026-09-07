"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sensorRequest } from "../lib/http/sensorRequest";
import {
  parseLocalSensorPayload,
  type HttpSensorReading,
} from "../lib/http/parseLocalSensorPayload";

const SENSOR_ENDPOINT = "http://192.168.1.42/sensor.txt";
// Local LAN polling only. It is the change-detection cadence, not the Celerity
// cadence: an actuator pulse lasts ~60 s and a nonce step is instantaneous, so
// both have to be noticed promptly. Publishing stays event- plus heartbeat-driven.
const SENSOR_POLL_INTERVAL_MS = 1_000;
const SENSOR_NAME = "Warehouse 1";

// "no-reading" means the ESP32 answered normally but reported NA for the
// environmental values. The device is online; only this cycle has no data.
export type LocalSensorStatus = "idle" | "reading" | "online" | "no-reading" | "error";

type RequestFailure = {
  category: string;
  message: string;
};

type LocalSensorTestProps = {
  onReading?: (reading: HttpSensorReading) => void;
  onStatusChange?: (status: LocalSensorStatus, detail: string) => void;
};

class LocalSensorDiagnosticError extends Error {
  constructor(readonly category: string, message: string) {
    super(message);
    this.name = "LocalSensorDiagnosticError";
  }
}

function describeFailure(error: unknown): RequestFailure {
  if (error instanceof LocalSensorDiagnosticError) {
    return { category: error.category, message: error.message };
  }

  if (error instanceof DOMException) {
    const category =
      error.name === "SecurityError" || error.name === "NotAllowedError"
        ? "HOST SECURITY POLICY"
        : error.name === "AbortError"
          ? "REQUEST ABORTED"
          : "BROWSER API ERROR";
    return { category, message: error.message || error.name };
  }

  if (error instanceof TypeError) {
    return {
      category: "FETCH BLOCKED OR NETWORK ERROR",
      message: error.message,
    };
  }

  return {
    category: "JAVASCRIPT ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

function relativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export function LocalSensorTest({ onReading, onStatusChange }: LocalSensorTestProps) {
  const [status, setStatus] = useState<LocalSensorStatus>("idle");
  const [reading, setReading] = useState<HttpSensorReading | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const callbacksRef = useRef({ onReading, onStatusChange });
  const inFlightRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    callbacksRef.current = { onReading, onStatusChange };
  }, [onReading, onStatusChange]);

  const readSensor = useCallback(async () => {
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    if (mountedRef.current) {
      setStatus("reading");
      callbacksRef.current.onStatusChange?.("reading", "READING");
    }

    try {
      const text = await sensorRequest(async (signal) => {
        const response = await fetch(SENSOR_ENDPOINT, { cache: "no-store", signal });
        if (!response.ok) {
          throw new LocalSensorDiagnosticError(
            "HTTP ERROR",
            `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
          );
        }
        return response.text();
      });
      const parsed = parseLocalSensorPayload(text);

      if (!parsed.ok) {
        // Keep the last known reading on screen and keep polling: an NA cycle
        // is a device state, not a gateway failure.
        if (parsed.reason === "no-reading") {
          if (!mountedRef.current) return;
          setLastError(null);
          setRawResponse(text);
          setStatus("no-reading");
          callbacksRef.current.onStatusChange?.("no-reading", `NO READING: ${parsed.error}`);
          return;
        }

        throw new LocalSensorDiagnosticError("INVALID PAYLOAD", parsed.error);
      }

      if (!mountedRef.current) return;
      setLastError(null);
      setRawResponse(text);
      setNow(parsed.value.timestamp);
      setReading(parsed.value);
      setStatus("online");
      callbacksRef.current.onReading?.(parsed.value);
      callbacksRef.current.onStatusChange?.("online", "ONLINE");
    } catch (error) {
      console.error("[industrial:http] Local sensor request failed", error);
      if (!mountedRef.current) return;

      const described = describeFailure(error);
      setLastError(described.message);
      setStatus("error");
      callbacksRef.current.onStatusChange?.(
        "error",
        `${described.category}: ${described.message}`,
      );
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void readSensor();

    const sensorPollTimer = window.setInterval(
      () => void readSensor(),
      SENSOR_POLL_INTERVAL_MS,
    );
    const ageTicker = window.setInterval(() => setNow(Date.now()), 1_000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(sensorPollTimer);
      window.clearInterval(ageTicker);
    };
  }, [readSensor]);

  // Once discovered, keep this panel visible during outages so the last
  // successful read and the HTTP failure can be distinguished from Celerity.
  if (reading === null) return null;

  const statusClass = status === "online" ? "status-live" : "status-connecting";

  return (
    <section className="panel localSensorPanel">
      <div className="sectionHeading">
        <div>
          <span className="eyebrow">PHYSICAL SENSOR</span>
          <h2>{SENSOR_NAME}</h2>
        </div>
        <div className={`status ${statusClass}`}>
          <span className="dot" />
          {lastError ? "RECONNECTING" : status.toUpperCase()}
        </div>
      </div>

      <div className="localSensorEndpoint">
        <span>Endpoint</span>
        <code>{SENSOR_ENDPOINT}</code>
      </div>

      <div className="localSensorActions">
        <button
          className="primaryButton"
          onClick={() => void readSensor()}
          disabled={status === "reading"}
        >
          {status === "reading" ? "READING…" : "READ SENSOR"}
        </button>
        <span>Desktop gateway polling is active every second.</span>
      </div>

      <div className="localSensorResult">
        <div className="localSensorMetrics">
          <div>
            <span>Temperature</span>
            <strong>{reading.temperature.toFixed(1)}<small> °C</small></strong>
          </div>
          <div>
            <span>Humidity</span>
            <strong>{reading.humidity.toFixed(1)}<small> %</small></strong>
          </div>
        </div>

        <div className="localSensorOnline">
          <span className="dot" />
          {lastError ? "SENSOR UNREACHABLE · RETRYING AUTOMATICALLY" : status === "no-reading" ? "SENSOR ONLINE · NO CURRENT READING" : "SENSOR ONLINE"}
        </div>
        {lastError ? <p role="status">{lastError}. Values shown are from the last successful read.</p> : null}

        <div className="localActuatorState">
          <div><span>ACTUATOR-01 state</span><strong className={reading.actuatorState === "ON" ? "actuatorOn" : "actuatorOff"}>{reading.actuatorState ?? "—"}</strong></div>
          <div><span>Last trigger observed</span><strong>{reading.actuatorNonce === undefined ? "—" : `#${reading.actuatorNonce}`}</strong></div>
        </div>

        <div className="localSensorDetails">
          <div><span className="label">Source</span><code>LOCAL HTTP</code></div>
          <div><span className="label">Polling</span><code>1 SEC</code></div>
          <div><span className="label">Last read</span><code>{relativeTime(reading.timestamp, now)}</code></div>
          <div><span className="label">Raw</span><code>{rawResponse ?? "—"}</code></div>
        </div>
      </div>
    </section>
  );
}
