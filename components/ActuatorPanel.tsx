"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActuatorState } from "../lib/http/parseLocalSensorPayload";
import {
  isActuatorContractConfigured,
  readPrice,
  readTriggerNonce,
  triggerActuator,
  type ActuatorTransactionStatus,
} from "../lib/actuator/contract";
import {
  ACTUATOR_CONTRACT_ADDRESS,
  ACTUATOR_NETWORK,
  ACTUATOR_PACKAGE_NAME,
  ACTUATOR_PRICE_LABEL,
  ACTUATOR_PRICE_EVM,
  ACTUATOR_RUN_SECONDS,
} from "../lib/actuator/config";

type ActuatorPanelProps = {
  deviceNonce?: number;
  deviceState?: ActuatorState;
};

type ActivationPhase =
  | "unconfigured"
  | "loading"
  | "ready"
  | "requested"
  | "checking"
  | "preparing"
  | "confirming"
  | "confirmed"
  | "error";

function messageFromError(error: unknown) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function ActuatorPanel({ deviceNonce, deviceState }: ActuatorPanelProps) {
  const configured = isActuatorContractConfigured();
  const [phase, setPhase] = useState<ActivationPhase>(
    configured ? "loading" : "unconfigured",
  );
  const [chainNonce, setChainNonce] = useState<bigint | null>(null);
  const [confirmedNonce, setConfirmedNonce] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshChainState = useCallback(async () => {
    if (!configured) return;
    const [nonce, price] = await Promise.all([readTriggerNonce(), readPrice()]);
    if (price !== ACTUATOR_PRICE_EVM) {
      throw new Error(`Unexpected contract price: ${price.toString()}.`);
    }
    setChainNonce(nonce);
  }, [configured]);

  useEffect(() => {
    let cancelled = false;
    if (!configured) return;

    void refreshChainState()
      .then(() => {
        if (!cancelled) setPhase("ready");
      })
      .catch((readError) => {
        console.error("[industrial:actuator] Contract state read failed", readError);
        if (!cancelled) {
          setError(messageFromError(readError));
          setPhase("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [configured, refreshChainState]);

  function handleTransactionStatus(status: ActuatorTransactionStatus) {
    if (status === "error") {
      setPhase("error");
      return;
    }
    if (status === "connecting" || status === "signing") {
      setPhase("requested");
      return;
    }
    if (status === "checking-balance") {
      setPhase("checking");
      return;
    }
    if (status === "mapping") {
      setPhase("preparing");
      return;
    }
    if (status !== "finalized") setPhase("confirming");
  }

  async function activate() {
    if (!configured || pending) return;

    setError(null);
    setConfirmedNonce(null);
    setPhase("requested");
    try {
      const result = await triggerActuator(handleTransactionStatus);
      setChainNonce(result.triggerNonce);
      setConfirmedNonce(result.triggerNonce);
      setPhase("confirmed");
    } catch (activationError) {
      console.error("[industrial:actuator] Activation failed", activationError);
      setError(messageFromError(activationError));
      setPhase("error");
    }
  }

  const pending =
    phase === "requested" ||
    phase === "checking" ||
    phase === "preparing" ||
    phase === "confirming";
  const stateClass = deviceState === "ON" ? "actuatorOn" : "actuatorOff";

  return (
    <section className="panel actuatorPanel">
      <div className="sectionHeading">
        <div>
          <span className="eyebrow">ACTUATOR</span>
          <h2>Trigger a physical device with an on-chain payment.</h2>
        </div>
        <code>ACTUATOR-01</code>
      </div>

      <div className="actuatorSummary">
        <div><span>Connected device</span><strong>Warehouse ventilation fan</strong></div>
        <div><span>Trigger</span><strong>{ACTUATOR_PRICE_LABEL}</strong></div>
        <div><span>Run time</span><strong>{ACTUATOR_RUN_SECONDS} seconds</strong></div>
        <div><span>Network</span><strong>{ACTUATOR_NETWORK}</strong></div>
      </div>

      <p className="actuatorExplanation">
        Pay 1 PAS to create an on-chain activation trigger. The ESP32 will verify the
        trigger and activate the connected ventilation fan for 60 seconds. The fan blows
        directly on the environmental sensor, allowing the resulting temperature and
        humidity change to be observed through the live telemetry.
      </p>

      <div className="actuatorEvidence">
        <div>
          <span>Physical state · ESP32 telemetry</span>
          <strong className={stateClass}>{deviceState ?? "—"}</strong>
        </div>
        <div>
          <span>Device observed</span>
          <strong>{deviceNonce === undefined ? "—" : `#${deviceNonce}`}</strong>
        </div>
        <div>
          <span>On-chain trigger</span>
          <strong>{chainNonce === null ? "—" : `#${chainNonce.toString()}`}</strong>
        </div>
      </div>

      <div className="actuatorAction">
        <button
          className="primaryButton"
          onClick={() => void activate()}
          disabled={!configured || pending || phase === "loading"}
        >
          {!configured
            ? "CONTRACT NOT DEPLOYED"
            : phase === "requested"
              ? "ACTIVATION REQUESTED"
              : phase === "confirming"
                ? "CONFIRMING ON-CHAIN TRIGGER..."
                : "ACTIVATE — 1 PAS"}
        </button>

        <div className="actuatorResult" aria-live="polite">
          {phase === "requested" ? <><strong>ACTIVATION REQUESTED</strong><span>Waiting for signature...</span></> : null}
          {phase === "checking" ? <><strong>CHECKING BALANCE</strong><span>Confirming the account can cover 1 PAS plus fees.</span></> : null}
          {phase === "preparing" ? <><strong>PREPARING ACCOUNT</strong><span>Approve the one-time account mapping in your wallet.</span></> : null}
          {phase === "confirming" ? <><strong>CONFIRMING ON-CHAIN TRIGGER...</strong><span>Waiting for finalized transaction.</span></> : null}
          {phase === "confirmed" && confirmedNonce !== null ? <><strong>PAYMENT CONFIRMED</strong><span>Activation #{confirmedNonce.toString()}</span><span>On-chain trigger ready for actuator.</span></> : null}
          {phase === "unconfigured" ? <><strong>DEPLOYMENT REQUIRED</strong><span>Contract package {ACTUATOR_PACKAGE_NAME} has no configured address.</span></> : null}
          {phase === "error" ? <><strong>ACTIVATION ERROR</strong><span>{error}</span></> : null}
        </div>
      </div>

      <div className="actuatorContractMeta">
        <span>Contract</span>
        <code>{ACTUATOR_CONTRACT_ADDRESS ?? "NOT DEPLOYED"}</code>
      </div>
    </section>
  );
}
