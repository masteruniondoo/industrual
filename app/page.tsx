"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isInsideContainer,
  requestResourceAllocation,
} from "@parity/product-sdk-host";
import {
  StatementConnectionError,
  StatementDataTooLargeError,
  StatementStoreClient,
  StatementStoreError,
  StatementSubmitError,
} from "@parity/product-sdk-statement-store";
import {
  LocalSensorTest,
  type LocalSensorStatus,
} from "../components/LocalSensorTest";
import type { HttpSensorReading } from "../lib/http/parseLocalSensorPayload";

const APP_NAME = "industrial";
const TOPIC_2 = "warehouse-01";
const CHANNEL = "warehouse-01/environment";
const SENSOR_ID = "WAREHOUSE-01";
const SENSOR_NAME = "Warehouse 1";
const STATEMENT_TTL_SECONDS = 90;
const PUBLISH_INTERVAL_MS = 30_000;
const LIVE_UNTIL_MS = 45_000;
const STALE_UNTIL_MS = 90_000;
const MAX_EVENTS = 20;
const HOST_TIMEOUT_MS = 12_000;
const STORE_TIMEOUT_MS = 15_000;
const ALLOWANCE_TIMEOUT_MS = 60_000;

type SensorReading = {
  type: "env";
  sensor: "WAREHOUSE-01";
  temperature: number;
  humidity: number;
  timestamp: number;
};

type EventRow = SensorReading & { receivedAt: number; signer?: string };
type ConnectionState = "connecting" | "connected" | "error";
type AllowanceState =
  | "assumed"
  | "not-requested"
  | "requesting"
  | "allocated"
  | "rejected"
  | "not-available"
  | "unverified"
  | "implicit"
  | "error";

type DiagnosticState = {
  host: string;
  statementStore: string;
  subscription: string;
  sensorHttp: string;
  publish: string;
  lastReceived: string;
};

let sharedClient: StatementStoreClient | null = null;

function acquireStatementStoreClient() {
  sharedClient ??= new StatementStoreClient({
    appName: APP_NAME,
    defaultTtlSeconds: STATEMENT_TTL_SECONDS,
  });
  return sharedClient;
}

function releaseStatementStoreClient(client: StatementStoreClient) {
  client.destroy();
  if (sharedClient === client) sharedClient = null;
}

function shortHex(value?: string) {
  if (!value) return "—";
  if (value.length < 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function serializeUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value, (_, nested) =>
      typeof nested === "bigint" ? nested.toString() : nested,
    );
  } catch {
    return String(value);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const detail = (error as Error & { detail?: unknown }).detail;
    if (detail !== undefined && detail !== error) {
      return `${error.message}; detail=${serializeUnknown(detail)}`;
    }
    return error.message;
  }
  if (error && typeof error === "object" && "reason" in error) {
    return String((error as { reason: unknown }).reason);
  }
  return serializeUnknown(error);
}

function statementErrorMessage(error: unknown): string {
  if (error instanceof StatementDataTooLargeError) {
    return `StatementDataTooLargeError: ${error.message} (${error.actualSize}/${error.maxSize} bytes)`;
  }
  if (error instanceof StatementSubmitError) {
    return `StatementSubmitError: ${error.message}; detail=${serializeUnknown(error.detail)}`;
  }
  if (error instanceof StatementConnectionError) {
    return `StatementConnectionError: ${error.message}`;
  }
  if (error instanceof StatementStoreError) {
    return `${error.constructor.name}: ${error.message}`;
  }
  return errorMessage(error);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => window.clearTimeout(timeout));
  });
}

function isSensorReading(value: unknown): value is SensorReading {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    row.type === "env" &&
    row.sensor === SENSOR_ID &&
    typeof row.temperature === "number" &&
    Number.isFinite(row.temperature) &&
    typeof row.humidity === "number" &&
    Number.isFinite(row.humidity) &&
    typeof row.timestamp === "number" &&
    Number.isFinite(row.timestamp)
  );
}

function ageLabel(timestamp: number | null, now: number): string {
  if (timestamp === null) return "—";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

function allowanceLabel(state: AllowanceState): string {
  switch (state) {
    case "assumed": return "ASSUMED — VERIFYING";
    case "not-requested": return "NOT REQUESTED";
    case "requesting": return "REQUESTING — CONFIRM IN HOST";
    case "allocated": return "ALLOCATED";
    case "rejected": return "REJECTED";
    case "not-available": return "NOT AVAILABLE";
    case "unverified": return "RESPONSE UNREADABLE — VERIFY BY PUBLISHING";
    case "implicit": return "IMPLICIT HOST PROVISIONING";
    case "error": return "ERROR";
  }
}

function isMissingAllowanceError(message: string): boolean {
  return /no allowance|missing allowance|allowance (?:is )?not (?:set|found|allocated)/i.test(
    message,
  );
}

export default function Home() {
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [connectionDetail, setConnectionDetail] = useState("Detecting Polkadot Products host…");
  const [latest, setLatest] = useState<EventRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [physicalReading, setPhysicalReading] = useState<HttpSensorReading | null>(null);
  const [allowance, setAllowance] = useState<AllowanceState>("assumed");
  const [allocating, setAllocating] = useState(false);
  const [autoPublish, setAutoPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lastPublishAt, setLastPublishAt] = useState<number | null>(null);
  const [lastPublishResult, setLastPublishResult] = useState("NOT TESTED");
  const [now, setNow] = useState(() => Date.now());
  const [diagnostics, setDiagnostics] = useState<DiagnosticState>({
    host: "CHECKING",
    statementStore: "NOT CONNECTED",
    subscription: "INACTIVE",
    sensorHttp: "CHECKING",
    publish: "NOT TESTED",
    lastReceived: "—",
  });
  const clientRef = useRef<StatementStoreClient | null>(null);
  const physicalReadingRef = useRef<HttpSensorReading | null>(null);
  const publishInFlightRef = useRef(false);
  const initialPublishAttemptRef = useRef(false);

  const updateDiagnostic = useCallback((key: keyof DiagnosticState, value: string) => {
    setDiagnostics((current) => ({ ...current, [key]: value }));
  }, []);

  const recordCelerityReading = useCallback((
    reading: SensorReading,
    receivedAt: number,
    signer?: string,
  ) => {
    const received: EventRow = { ...reading, receivedAt, signer };

    setLatest((current) => {
      if (current && current.timestamp > received.timestamp) return current;
      if (current?.timestamp === received.timestamp) {
        return { ...received, signer: signer ?? current.signer };
      }
      return received;
    });

    setEvents((current) => {
      const existing = current.find(
        (event) => event.sensor === received.sensor && event.timestamp === received.timestamp,
      );
      const merged: EventRow = {
        ...received,
        receivedAt: existing?.receivedAt ?? receivedAt,
        signer: signer ?? existing?.signer,
      };

      return [
        merged,
        ...current.filter(
          (event) => event.sensor !== received.sensor || event.timestamp !== received.timestamp,
        ),
      ]
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, MAX_EVENTS);
    });

    updateDiagnostic("lastReceived", new Date(receivedAt).toLocaleTimeString());
  }, [updateDiagnostic]);

  const handlePhysicalReading = useCallback((reading: HttpSensorReading) => {
    physicalReadingRef.current = reading;
    setPhysicalReading(reading);
  }, []);

  const handleSensorStatus = useCallback((status: LocalSensorStatus, detail: string) => {
    updateDiagnostic("sensorHttp", detail);

    if (status === "error") {
      physicalReadingRef.current = null;
      setPhysicalReading(null);
      setAutoPublish(false);
    }
  }, [updateDiagnostic]);

  useEffect(() => {
    const ticker = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(ticker);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let hostWasDetected = false;
    const client = acquireStatementStoreClient();
    clientRef.current = client;
    let subscription: { unsubscribe: () => void } | undefined;

    async function boot() {
      try {
        setConnection("connecting");
        setConnectionDetail("Detecting Polkadot Products host…");

        const hostDetected = await withTimeout(
          isInsideContainer(),
          HOST_TIMEOUT_MS,
          "Products host detection timed out.",
        );
        if (!hostDetected) {
          throw new Error(
            "Polkadot Products host was not detected. Open industrial.dot inside a Products container.",
          );
        }
        if (cancelled) return;
        hostWasDetected = true;
        updateDiagnostic("host", "DETECTED");
        setConnectionDetail("Connecting to Celerity / Statement Store in host mode…");

        await withTimeout(
          client.connect({ mode: "host" }),
          STORE_TIMEOUT_MS,
          "Statement Store timed out. The Products host did not answer.",
        );
        if (cancelled) return;
        updateDiagnostic("statementStore", "CONNECTED (HOST MODE)");

        subscription = client.subscribe<SensorReading>(
          (statement) => {
            if (!isSensorReading(statement.data)) {
              console.warn("[industrial] Ignored malformed or unrelated statement", statement.data);
              return;
            }

            recordCelerityReading(statement.data, Date.now(), statement.signerHex);
          },
          { topic2: TOPIC_2 },
        );

        updateDiagnostic("subscription", "ACTIVE");
        setConnection("connected");
        setConnectionDetail(`Celerity connected; subscribed to ${SENSOR_NAME}`);
      } catch (error) {
        console.error("[industrial] Celerity boot failed", error);
        if (cancelled) return;
        setConnection("error");
        setConnectionDetail(statementErrorMessage(error));
        if (!hostWasDetected) updateDiagnostic("host", "NOT DETECTED");
        updateDiagnostic("statementStore", `ERROR: ${statementErrorMessage(error)}`);
      }
    }

    void boot();

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      releaseStatementStoreClient(client);
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [recordCelerityReading, updateDiagnostic]);

  const requestAllowance = useCallback(async () => {
    if (
      allowance === "assumed" ||
      allowance === "requesting" ||
      allowance === "allocated" ||
      allowance === "implicit" ||
      allowance === "not-available" ||
      allowance === "unverified"
    ) {
      return;
    }

    if (connection !== "connected" || !clientRef.current?.isConnected()) {
      setAllowance("error");
      setLastPublishResult("StatementConnectionError: Statement Store is not connected");
      return;
    }

    setAllocating(true);
    setAllowance("requesting");

    try {
      const allocationResult = await withTimeout(
        requestResourceAllocation([
          { tag: "StatementStoreAllowance", value: undefined },
        ]),
        ALLOWANCE_TIMEOUT_MS,
        "Statement Store allowance request timed out. Confirm it in the Products host.",
      );

      if (!allocationResult.ok) throw allocationResult.error;
      const outcome = allocationResult.value[0];

      switch (outcome) {
        case "Allocated":
          setAllowance("allocated");
          break;
        case "Rejected":
          setAllowance("rejected");
          break;
        case "NotAvailable":
          setAllowance("not-available");
          break;
        default:
          throw new Error(`Unexpected allocation outcome: ${serializeUnknown(outcome)}`);
      }
    } catch (error) {
      console.error("[industrial] Statement Store allowance request failed", error);
      const message = errorMessage(error);
      if (message.includes("Unknown enum discriminant")) {
        setAllowance("unverified");
        setLastPublishResult(
          "ALLOCATION RESPONSE UNREADABLE — USE PUBLISH CURRENT READING TO VERIFY THE APPROVED ALLOWANCE",
        );
      } else {
        setAllowance("error");
        setLastPublishResult(`ALLOWANCE ERROR: ${message}`);
      }
    } finally {
      setAllocating(false);
    }
  }, [allowance, connection]);

  const publishCurrentReading = useCallback(async (trigger: "manual" | "automatic") => {
    if (publishInFlightRef.current) return false;

    const client = clientRef.current;
    const current = physicalReadingRef.current;

    if (!client?.isConnected()) {
      const message = "StatementConnectionError: Statement Store is not connected";
      setLastPublishResult(message);
      updateDiagnostic("publish", message);
      return false;
    }
    if (
      !current ||
      !Number.isFinite(current.temperature) ||
      !Number.isFinite(current.humidity) ||
      !Number.isFinite(current.timestamp)
    ) {
      const message = "REJECTED: NO VALID PHYSICAL SENSOR READING";
      setLastPublishResult(message);
      updateDiagnostic("publish", message);
      return false;
    }

    const reading: SensorReading = {
      type: "env",
      sensor: SENSOR_ID,
      temperature: current.temperature,
      humidity: current.humidity,
      timestamp: current.timestamp,
    };

    publishInFlightRef.current = true;
    setPublishing(true);
    setLastPublishResult(`${trigger.toUpperCase()} SUBMISSION IN PROGRESS`);
    updateDiagnostic("publish", `${trigger.toUpperCase()} SUBMISSION IN PROGRESS`);

    try {
      const result = await withTimeout(
        client.publish(reading, {
          topic2: TOPIC_2,
          channel: CHANNEL,
          ttlSeconds: STATEMENT_TTL_SECONDS,
        }),
        STORE_TIMEOUT_MS,
        "Statement Store publish timed out.",
      );

      if (!result.ok) throw result.error;

      const acceptedAt = Date.now();
      console.info("[industrial] Statement Store publish accepted", { trigger, reading });
      setLastPublishAt(acceptedAt);
      setLastPublishResult("ACCEPTED");
      updateDiagnostic("publish", "ACCEPTED");
      recordCelerityReading(reading, acceptedAt);
      setAllowance((currentAllowance) =>
        currentAllowance === "allocated" ? currentAllowance : "implicit",
      );
      return true;
    } catch (error) {
      const message = statementErrorMessage(error);
      console.error("[industrial] Statement Store publish failed", error);
      setLastPublishResult(message);
      updateDiagnostic("publish", `ERROR: ${message}`);
      setAllowance((currentAllowance) =>
        currentAllowance === "assumed" || isMissingAllowanceError(message)
          ? "not-requested"
          : currentAllowance,
      );
      setAutoPublish(false);
      return false;
    } finally {
      publishInFlightRef.current = false;
      setPublishing(false);
    }
  }, [recordCelerityReading, updateDiagnostic]);

  useEffect(() => {
    if (
      initialPublishAttemptRef.current ||
      allowance !== "assumed" ||
      connection !== "connected" ||
      !physicalReading
    ) {
      return;
    }

    initialPublishAttemptRef.current = true;
    void publishCurrentReading("automatic").then((accepted) => {
      if (accepted) setAutoPublish(true);
    });
  }, [allowance, connection, physicalReading, publishCurrentReading]);

  useEffect(() => {
    if (!autoPublish) return;
    const celerityPublishTimer = window.setInterval(
      () => void publishCurrentReading("automatic"),
      PUBLISH_INTERVAL_MS,
    );
    return () => window.clearInterval(celerityPublishTimer);
  }, [autoPublish, publishCurrentReading]);

  function toggleAutoPublish() {
    if (autoPublish) {
      setAutoPublish(false);
      return;
    }
    if (connection !== "connected") {
      const message = "ENABLE FAILED: STATEMENT STORE NOT CONNECTED";
      setLastPublishResult(message);
      updateDiagnostic("publish", message);
      return;
    }
    if (!physicalReadingRef.current) {
      const message = "ENABLE FAILED: NO VALID PHYSICAL SENSOR READING";
      setLastPublishResult(message);
      updateDiagnostic("publish", message);
      return;
    }
    if (
      allowance !== "assumed" &&
      allowance !== "allocated" &&
      allowance !== "implicit"
    ) {
      const message = "ENABLE CELERITY BEFORE AUTO PUBLISH";
      setLastPublishResult(message);
      updateDiagnostic("publish", message);
      return;
    }
    setAutoPublish(true);
  }

  const signalAge = latest ? Math.max(0, now - latest.receivedAt) : null;
  const signalLabel = useMemo(() => {
    if (connection !== "connected") return connection === "connecting" ? "CONNECTING" : "OFFLINE";
    if (signalAge === null || signalAge > STALE_UNTIL_MS) return "NO SIGNAL";
    if (signalAge >= LIVE_UNTIL_MS) return "STALE";
    return "LIVE";
  }, [connection, signalAge]);

  const allowanceStatusClass =
    allowance === "allocated" || allowance === "implicit"
      ? "status-live"
      : allowance === "assumed" || allowance === "requesting"
        ? "status-connecting"
        : allowance === "rejected" || allowance === "error"
          ? "status-offline"
          : "status-no-signal";

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">INDUSTRIAL · LIVE MONITORING</div>
          <h1>industrial</h1>
        </div>
        <div className={`status status-${signalLabel.toLowerCase().replace(" ", "-")}`}>
          <span className="dot" />
          {signalLabel}
        </div>
      </header>

      {signalLabel !== "LIVE" ? <section className="panel demoNotice" role="status">
        <div className="demoNoticeStatus">
          <span className="dot" />
          BROADCAST ENDED
        </div>
        <div>
          <span className="eyebrow">DEMONSTRATION COMPLETED</span>
          <h2>More than 30 hours of continuous monitoring</h2>
          <p>
            Temperature and humidity broadcasting has ended after more than 30 hours of
            uninterrupted operation. The test successfully demonstrated sensor message
            delivery through Polkadot Celerity.
          </p>
        </div>
      </section> : null}

      <LocalSensorTest
        onReading={handlePhysicalReading}
        onStatusChange={handleSensorStatus}
      />

      {physicalReading ? <section className="panel gatewayPanel">
        <div className="sectionHeading">
          <div><span className="eyebrow">CELERITY GATEWAY</span><h2>Desktop publisher</h2></div>
          <div className={`status ${allowanceStatusClass}`}>
            <span className="dot" />
            {allowanceLabel(allowance)}
          </div>
        </div>

        <div className="gatewayActions">
          <button
            className="primaryButton"
            onClick={() => void requestAllowance()}
            disabled={
              allocating ||
              connection !== "connected" ||
              allowance === "assumed" ||
              allowance === "allocated" ||
              allowance === "implicit" ||
              allowance === "not-available" ||
              allowance === "unverified"
            }
          >
            {allocating
              ? "REQUESTING…"
              : allowance === "assumed"
                ? "VERIFYING ALLOWANCE…"
                : allowance === "allocated" || allowance === "implicit"
                  ? "CELERITY ENABLED"
                  : allowance === "not-available" || allowance === "unverified"
                    ? "VERIFY WITH MANUAL PUBLISH"
                    : "ENABLE CELERITY"}
          </button>
          <button
            className={autoPublish ? "toggleButton toggleButtonOn" : "toggleButton"}
            onClick={toggleAutoPublish}
            aria-pressed={autoPublish}
            disabled={
              connection !== "connected" ||
              (allowance !== "assumed" &&
                allowance !== "allocated" &&
                allowance !== "implicit")
            }
          >
            AUTO PUBLISH · {autoPublish ? "ON" : "OFF"}
          </button>
          <button
            className="secondaryActionButton"
            onClick={() => void publishCurrentReading("manual")}
            disabled={publishing || connection !== "connected" || !physicalReading}
          >
            {publishing ? "PUBLISHING…" : "PUBLISH CURRENT READING"}
          </button>
        </div>

        <div className="gatewayGrid">
          <div><span>Allowance</span><strong>{allowanceLabel(allowance)}</strong></div>
          <div><span>Host mode</span><strong>{connection === "connected" ? "CONNECTED" : connection.toUpperCase()}</strong></div>
          <div><span>Auto publish</span><strong>{autoPublish ? "ON" : "OFF"}</strong></div>
          <div><span>Publish interval</span><strong>30 SEC</strong></div>
          <div><span>Last physical reading</span><strong>{ageLabel(physicalReading?.timestamp ?? null, now)}</strong></div>
          <div><span>Last Celerity publish</span><strong>{ageLabel(lastPublishAt, now)}</strong></div>
          <div className="gatewayResult"><span>Result</span><strong>{lastPublishResult}</strong></div>
        </div>
      </section> : null}

      <section className="hero panel">
        <div className="heroTitle">
          <span>CELERITY LIVE · REMOTE RECEIVER</span>
          <strong>{SENSOR_NAME}</strong>
        </div>
        <div className="metrics">
          <div className="metric">
            <span>Temperature</span>
            <strong>{latest ? latest.temperature.toFixed(1) : "—"}<small> °C</small></strong>
          </div>
          <div className="metric">
            <span>Humidity</span>
            <strong>{latest ? latest.humidity.toFixed(1) : "—"}<small> %</small></strong>
          </div>
        </div>
        <div className="metaGrid">
          <div><span>Namespace</span><strong>{APP_NAME}</strong></div>
          <div><span>Topic</span><strong>{TOPIC_2}</strong></div>
          <div><span>Received</span><strong>{ageLabel(latest?.receivedAt ?? null, now)}</strong></div>
          <div><span>Signals received</span><strong>{events.length}</strong></div>
        </div>
      </section>

      {physicalReading ? <section className="panel connectionPanel">
        <div><span className="label">Connection</span><strong>{connectionDetail}</strong></div>
        <div><span className="label">Products host detected</span><code>{diagnostics.host}</code></div>
        <div><span className="label">Statement Store</span><code>{diagnostics.statementStore}</code></div>
        <div><span className="label">Subscription</span><code>{diagnostics.subscription}</code></div>
        <div><span className="label">Statement Store allowance</span><code>{allowanceLabel(allowance)}</code></div>
        <div><span className="label">Sensor HTTP status</span><code>{diagnostics.sensorHttp}</code></div>
        <div><span className="label">Last physical reading</span><code>{ageLabel(physicalReading?.timestamp ?? null, now)}</code></div>
        <div><span className="label">Auto publish</span><code>{autoPublish ? "ON" : "OFF"}</code></div>
        <div><span className="label">Last publish result</span><code>{diagnostics.publish}</code></div>
        <div><span className="label">Last received statement</span><code>{diagnostics.lastReceived}</code></div>
        <div><span className="label">Signals received</span><code>{events.length}</code></div>
      </section> : null}

      <section className="panel eventPanel">
        <div className="sectionHeading">
          <div><span className="eyebrow">RECENT CELERITY SIGNALS</span><h2>Statement Store feed</h2></div>
          <span>{events.length}/{MAX_EVENTS}</span>
        </div>
        {events.length === 0 ? (
          <div className="empty">
            <strong>Waiting for {SENSOR_NAME}…</strong>
            <span>Subscribed to appName “{APP_NAME}” and topic2 “{TOPIC_2}”.</span>
          </div>
        ) : (
          <div className="tableWrap">
            <table>
              <thead><tr><th>Received</th><th>Temperature</th><th>Humidity</th><th>Sensor time</th><th>Signer</th></tr></thead>
              <tbody>
                {events.map((event, index) => (
                  <tr key={`${event.receivedAt}-${index}`}>
                    <td>{new Date(event.receivedAt).toLocaleTimeString()}</td>
                    <td>{event.temperature.toFixed(1)} °C</td>
                    <td>{event.humidity.toFixed(1)} %</td>
                    <td>{new Date(event.timestamp).toLocaleTimeString()}</td>
                    <td><code>{shortHex(event.signer)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer>
        Statement Store authenticates the Products host publisher; ESP32 device signing is not included yet.
      </footer>
    </main>
  );
}
