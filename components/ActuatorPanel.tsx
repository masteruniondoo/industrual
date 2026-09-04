"use client";

import { useEffect, useState } from "react";
import type { ActuatorState } from "../lib/http/parseLocalSensorPayload";
import {
  connectActuatorWallet,
  isActuatorContractConfigured,
  readTriggerNonce,
  triggerActuator,
  type ActuatorTransactionStatus,
} from "../lib/actuator/contract";
import {
  ACTUATOR_CONTRACT_ADDRESS,
  ACTUATOR_NETWORK,
  ACTUATOR_PACKAGE_NAME,
  ACTUATOR_PRICE_LABEL,
  ACTUATOR_RUN_SECONDS,
} from "../lib/actuator/config";

type ActuatorPanelProps = {
  deviceNonce?: number;
  deviceState?: ActuatorState;
};

type ActivationPhase =
  | "unconfigured"
  | "disconnected"
  | "connecting"
  | "preparing"
  | "connected"
  | "requested"
  | "broadcasting"
  | "in-block"
  | "verifying"
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
    configured ? "disconnected" : "unconfigured",
  );
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [chainNonce, setChainNonce] = useState<bigint | null>(null);
  const [confirmedNonce, setConfirmedNonce] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;

    let cancelled = false;
    void readTriggerNonce()
      .then((nonce) => {
        if (!cancelled) setChainNonce(nonce);
      })
      .catch((readError) => {
        console.warn("[industrial:actuator] Initial trigger nonce read failed", readError);
      });

    return () => {
      cancelled = true;
    };
  }, [configured]);

  function handleTransactionStatus(status: ActuatorTransactionStatus) {
    if (status === "error") {
      setPhase("error");
      return;
    }
    if (status === "connecting" || status === "signing") {
      if (status === "connecting") {
        setPhase("preparing");
        return;
      }
      setPhase("requested");
      return;
    }
    if (status === "broadcasting") {
      setPhase("broadcasting");
      return;
    }
    if (status === "in-block") {
      setPhase("in-block");
      return;
    }
    if (status === "finalized") setPhase("verifying");
  }

  async function connectWallet() {
    if (!configured || pending || walletAddress) return;

    setError(null);
    setPhase("connecting");
    try {
      const address = await connectActuatorWallet();
      setWalletAddress(address);
      setPhase("connected");
    } catch (connectionError) {
      console.error("[industrial:actuator] Wallet connection failed", connectionError);
      setError(messageFromError(connectionError));
      setPhase("error");
    }
  }

  async function activate() {
    if (!configured || pending || !walletAddress) return;

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
    phase === "connecting" ||
    phase === "preparing" ||
    phase === "requested" ||
    phase === "broadcasting" ||
    phase === "in-block" ||
    phase === "verifying";
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
          onClick={() => void (walletAddress ? activate() : connectWallet())}
          disabled={!configured || pending}
        >
          {!configured
            ? "CONTRACT NOT DEPLOYED"
            : !walletAddress
              ? "CONNECT WALLET"
              : phase === "connecting" || phase === "preparing"
                ? "PREPARING PAYMENT..."
            : phase === "requested"
              ? "ACTIVATION REQUESTED"
              : phase === "broadcasting"
                ? "BROADCASTING PAYMENT..."
                : phase === "in-block" || phase === "verifying"
                  ? "CONFIRMING ON-CHAIN TRIGGER..."
                  : "PAY 1 PAS"}
        </button>

        <div className="actuatorResult" aria-live="polite">
            {phase === "connecting" ? <><strong>CONNECTING WALLET</strong><span>Approve wallet access in the host.</span></> : null}
            {phase === "preparing" ? <><strong>PREPARING PAYMENT</strong><span>Preparing the account and payment request.</span></> : null}
            {phase === "connected" && walletAddress ? <><strong>WALLET CONNECTED</strong><span className="walletAddress">{walletAddress}</span></> : null}
          {phase === "requested" ? <><strong>ACTIVATION REQUESTED</strong><span>Waiting for signature...</span></> : null}
          {phase === "broadcasting" ? <><strong>PAYMENT BROADCAST</strong><span>Waiting for the network to include the transaction.</span></> : null}
          {phase === "in-block" ? <><strong>PAYMENT IN BLOCK</strong><span>Waiting for finalization.</span></> : null}
          {phase === "verifying" ? <><strong>PAYMENT FINALIZED</strong><span>Verifying the updated contract state.</span></> : null}
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
