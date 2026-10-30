// The overview page. Everything here is static; the interactive console is
// the original page in LiveLab.tsx, shown in place at #lab by ViewSwitch.
// It is written as a document: numbered sections, plain tables and lists.
// Every section states its status so a reader can tell what has run on the
// bench from what is only being investigated; see section 5 before adding
// a new claim.

import { ViewSwitch } from "./ViewSwitch";

type Status = "tested" | "next" | "research";

const STATUS_LABEL: Record<Status, string> = {
  tested: "tested on hardware",
  next: "engineering, not built",
  research: "research, not built",
};

function StatusLine({ status, label }: { status: Status; label?: string }) {
  return (
    <p className="statusLine">
      Status: <span className={`st st-${status}`}>{label ?? STATUS_LABEL[status]}</span>
    </p>
  );
}

const SECTIONS = [
  { id: "how", title: "Architecture" },
  { id: "evidence", title: "Results on the bench" },
  { id: "invariant", title: "Security invariant" },
  { id: "privacy", title: "Process privacy" },
  { id: "roadmap", title: "Status and roadmap" },
  { id: "live-lab", title: "Live Lab" },
];

const SUMMARY = [
  { label: "GRANDPA quorum checked on the ESP32 itself", value: "strictly > 2/3 of weight" },
  { label: "Verified on-chain trigger → relay pulse", value: "1 PAS (testnet), 60 s" },
  { label: "Our own backend, database or trusted controller", value: "none" },
];

const TELEMETRY_FLOW = [
  { name: "DHT11", detail: "Measures temperature and humidity." },
  { name: "ESP32", detail: "Reads the sensor over a wire and serves it at /sensor.txt." },
  { name: "Desktop gateway", detail: "industrial.dot, running in the Products Desktop host; must stay online for telemetry." },
  { name: "Celerity", detail: "Carries signed Statement Store messages." },
  { name: "Remote clients", detail: "Desktop and Android." },
];

const CONTROL_FLOW = [
  { name: "Payment", detail: "1 testnet PAS from any Products wallet." },
  { name: "Actuator contract", detail: "Increments triggerNonce on Asset Hub." },
  { name: "GRANDPA finality", detail: "Finalizes the block on the Paseo relay chain." },
  { name: "ESP32 light client", detail: "Verifies every proof itself." },
  { name: "Relay and fan", detail: "GPIO18, held on for 60 s." },
];

const EVIDENCE = [
  {
    title: "Continuous telemetry",
    body: "DHT11 readings travelled from the ESP32 through the desktop gateway and Celerity to remote Products clients without a backend of our own. Clients mark a signal LIVE, STALE or NO SIGNAL from its age.",
  },
  {
    title: "Finality verified on the device",
    body: "The ESP32 checks Ed25519 GRANDPA justifications against an authority set it already trusts and requires strictly more than two thirds of the weight. RPC nodes and peers only supply bytes.",
  },
  {
    title: "A proof chain down to one storage slot",
    body: "Relay state root → Paras.Heads(1000) → Asset Hub header → contract info with a pinned trie id → child trie slot 0 → the nonce. A proof for any other contract is rejected.",
  },
  {
    title: "Authority set rotations",
    body: "Scheduled GRANDPA set changes (delay 0, up to 64 authorities) are derived on the device and committed to flash with A/B slots. The 250→251 rotation was followed live on the bench. Unsupported transitions, such as forced changes, fail closed.",
  },
  {
    title: "Warp sync over libp2p",
    body: "When its anchor falls too far behind, the device recovers over plain TCP libp2p with Noise XX, Yamux and PeerId enforcement, verifying every warp fragment before it trusts it. This is a purpose-built verifier and minimal warp client with a fixed bootnode list, not a full light client.",
  },
  {
    title: "From payment to a physical pulse",
    body: "Paying exactly 1 PAS increments the contract nonce. The ESP32 verifies the new nonce, writes it to flash before driving the pin, and holds the fan on for 60 seconds. Replays and lower nonces are refused. The first verified reading only sets a baseline, and a nonce that arrives while the fan is already on is consumed without extending the pulse. Several increments between two verification cycles do not guarantee several pulses. Live run: nonce 11 → 12, relay on for 60 s, no repeat on the next cycle.",
  },
];

const FIRMWARE_FACTS = [
  { label: "Flash", value: "77.3% of 1.31 MB" },
  { label: "Static RAM", value: "121 KiB of 320 KiB (38%)" },
  { label: "Native tests", value: "10/10 suites, 481 checks passing (one run, Sept 2026)" },
  { label: "Contract", value: "0x0863…3374 on para 1000 (testnet)" },
];

const CANNOT_ACTUATE = [
  "an RPC response",
  "a P2P peer",
  "an HTTP request",
  "Celerity",
  "industrial.dot",
  "a reboot",
  "a claimed nonce",
];

const APPROACHES = [
  { name: "Share raw data", compliance: "Available for independent inspection", knowHow: "Exposed" },
  { name: "Withhold raw data", compliance: "Producer's claim, taken on trust", knowHow: "Kept" },
  { name: "Zero-knowledge proof", compliance: "Defined conditions over committed data", knowHow: "Protected, subject to metadata leakage" },
];

const PRIVATE_INPUTS = [
  "Raw sensor trace for the batch",
  "Recipe setpoints and ramp profile",
  "Cycle timing and tolerances",
  "Line and equipment configuration",
];

const PUBLIC_OUTPUTS = [
  "A commitment to the trace, anchored on chain",
  "The predicate and the specification version it was checked against",
  "The batch identifier and time window",
  "The result, with a proof anyone can verify",
];

const PROOF_SHOWS = [
  "The committed trace satisfies the published predicate.",
  "The proof is bound to a specific on-chain commitment, preventing undetected substitution of the committed data. Authenticity and timing of physical measurements require additional controls.",
  "Which specification version it was checked against.",
];

const PROOF_DOES_NOT_SHOW = [
  "That the sensor told the truth. A proof over fabricated readings is still a valid proof.",
  "That the sensor was installed and calibrated as the specification requires.",
  "That the product meets every applicable requirement beyond the stated predicate.",
  "Anything about batches that were never committed.",
];

const HAVE_ALREADY = [
  "A device that verifies chain state on its own instead of trusting a server.",
  "An on-chain value on Asset Hub (today, the trigger nonce) that the device reads through proofs.",
  "A signed path that carries telemetry off the shop floor.",
];

const STILL_MISSING = [
  "Readings signed by the device. Today the Products host signs the publication; the ESP32 does not sign its readings.",
  "A commitment scheme for long, high-rate time series.",
  "A choice of proof system and circuit for range, duration and ordering predicates.",
  "Where the prover runs. The gateway, not the microcontroller, is the realistic first host.",
  "Proof verification on PolkaVM, or off-chain verification by the auditor.",
  "Metadata leakage: how often proofs appear can still reveal throughput.",
  "A hiding (salted) commitment: low-entropy sensor traces can otherwise be guessed from a plain hash.",
  "Predicate leakage: a too narrow public predicate can itself reveal the process.",
];

const ROADMAP: { status: Status; title: string; items: string[] }[] = [
  {
    status: "tested",
    title: "Now",
    items: [
      "DHT11 → ESP32 → gateway → Celerity telemetry",
      "Paid trigger on the Asset Hub contract",
      "On-device GRANDPA and trie proof verification",
      "Authority set rotation and warp sync recovery",
      "Replay-safe, persisted actuator nonce",
    ],
  },
  {
    status: "next",
    title: "Next",
    items: [
      "Readings signed by the ESP32 itself",
      "State proofs over P2P instead of public RPC",
      "Peer discovery and RPC failover",
      "Larger stack margins (currently ~1.8 KB minimum free)",
      "Device pairing over NFC/BLE for an ESP32 identity",
    ],
  },
  {
    status: "research",
    title: "Research",
    items: [
      "Zero-knowledge proofs of process compliance",
      "On-chain commitments to private process traces",
      "Verifying proofs on PolkaVM",
      "Limiting what proof metadata reveals",
    ],
  },
];

function FlowTable({ caption, steps }: { caption: string; steps: { name: string; detail: string }[] }) {
  return (
    <figure>
      <figcaption>{caption}</figcaption>
      <table className="flowTable">
        <thead>
          <tr><th scope="col">Step</th><th scope="col">Component</th><th scope="col">Role</th></tr>
        </thead>
        <tbody>
          {steps.map((step, index) => (
            <tr key={step.name}>
              <td className="num">{index + 1}</td>
              <td className="name">{step.name}</td>
              <td>{step.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  const number = SECTIONS.findIndex((section) => section.id === id) + 1;
  return (
    <h2 id={`${id}-title`}>
      <span className="sectionNo">{number}.</span>
      {children}
    </h2>
  );
}

export default function Home() {
  return <ViewSwitch overview={<Overview />} />;
}

function Overview() {
  return (
    <main className="shell home">
      <header className="topbar">
        <div>
          <div className="eyebrow">INDUSTRIAL.DOT · POLKADOT</div>
          <h1>industrial</h1>
        </div>
        <a className="labLink" href="#lab">Live Lab</a>
      </header>

      <article className="doc">
        <div className="docTitle">
          <h2>Verifiable infrastructure for industry: an engineering exploration</h2>
          <p className="byline">Project overview and research note</p>
        </div>

        <section className="abstract" aria-label="Abstract">
          <h3>Abstract</h3>
          <p>
            industrial.dot is an engineering exploration of a shared layer for industrial
            systems that does not depend on a trusted control server. It combines identity and
            signing through the Polkadot Products host, decentralized messaging through
            Celerity, and physical actions that a device verifies cryptographically before
            carrying them out.
          </p>
          <p>
            A bench prototype built on an ESP32 and the Paseo testnet (Asset Hub on the
            Polkadot Products Devnet) shows that telemetry and paid actuation can run without a
            backend of our own: the device checks chain finality and state proofs itself, and
            only a proven increase of the contract nonce, which the contract allows only for a
            1 PAS payment, can switch its relay. PAS is a testnet token with no monetary value.
            We are also investigating how a manufacturer could prove that a product was made
            within specification without revealing the process that made it, with applications
            in industrial automation, quality assurance and digital product passports. This is
            not a replacement for PLCs, safety interlocks or real-time control: one full
            verification cycle takes about 20 seconds.
          </p>
        </section>

        <figure>
          <figcaption>
            Table 1. Summary of results on the bench. Public RPC and P2P nodes and a desktop
            gateway are used as untrusted infrastructure.
          </figcaption>
          <table>
            <thead>
              <tr><th scope="col">Measure</th><th scope="col">Result</th></tr>
            </thead>
            <tbody>
              {SUMMARY.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className="value">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>

        <div className="legend">
          <p className="note">Each section states its status:</p>
          <dl>
            <dt className="st st-tested">Tested on hardware</dt>
            <dd>Built, run on the bench and evidenced.</dd>
            <dt className="st st-next">Engineering, not built</dt>
            <dd>Known work that has not been done yet.</dd>
            <dt className="st st-research">Research, not built</dt>
            <dd>A direction under investigation. No code exists.</dd>
          </dl>
        </div>

        <nav className="contents" aria-label="Contents">
          <h3>Contents</h3>
          <ol>
            {SECTIONS.map((section) => (
              <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>
            ))}
          </ol>
        </nav>

        <section id="how" aria-labelledby="how-title">
          <SectionHeading id="how">Architecture</SectionHeading>
          <StatusLine status="tested" />
          <p>
            Telemetry and control travel separate paths across one trust boundary. Observation
            flows outward through Celerity; activation only ever comes from state the device
            has proven for itself.
          </p>
          <h3>1.1 Telemetry loop: bench to phone</h3>
          <FlowTable caption="Table 2. Telemetry path" steps={TELEMETRY_FLOW} />
          <h3>1.2 Control loop: payment to relay</h3>
          <FlowTable caption="Table 3. Control path" steps={CONTROL_FLOW} />
          <p>
            Celerity is used for observation only. The ESP32 firmware has no Celerity client and
            no HTTP write route, so nothing published there can reach the relay. The desktop
            gateway is not part of the actuator authorization path. However, it currently reads
            and publishes telemetry, so the authenticity of sensor readings still depends on the
            gateway. Device-origin signatures are planned but not implemented.
          </p>
        </section>

        <section id="evidence" aria-labelledby="evidence-title">
          <SectionHeading id="evidence">Results on the bench</SectionHeading>
          <StatusLine status="tested" />
          <p>
            Each result below was obtained on the ESP32 on the bench, against the public Paseo
            network, not in a simulator.
          </p>
          {EVIDENCE.map((item, index) => (
            <div key={item.title}>
              <h3>2.{index + 1} {item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
          <figure>
            <figcaption>
              Table 4. Firmware build. Development measurements; not an audit or certification.
            </figcaption>
            <table>
              <tbody>
                {FIRMWARE_FACTS.map((fact) => (
                  <tr key={fact.label}>
                    <th scope="row">{fact.label}</th>
                    <td className="mono">{fact.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>
        </section>

        <section id="invariant" aria-labelledby="invariant-title">
          <SectionHeading id="invariant">Security invariant</SectionHeading>
          <StatusLine
            status="tested"
            label="tested on hardware and with negative fixtures; not formally verified"
          />
          <p>
            The actuator transitions from OFF to ON only when the ESP32 accepts a finalized,
            cryptographically verified contract nonce strictly higher than the persisted nonce,
            provided a baseline has been established and no actuator pulse is already active.
            None of the following can move the relay; each can only supply bytes that the device
            verifies again, or be ignored:
          </p>
          <ul className="twoColList">
            {CANNOT_ACTUATE.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p>
            These external sources may delay or withhold data, but cannot cause an activation
            without data that passes the device&apos;s proof verification. This depends on the
            trusted firmware, the initial checkpoint and the correctness of the verification
            implementation. The invariant assumes trusted firmware, a trusted initial checkpoint and no physical
            access to the device.
          </p>
        </section>

        <section id="privacy" aria-labelledby="privacy-title">
          <SectionHeading id="privacy">Process privacy</SectionHeading>
          <StatusLine status="research" />

          <h3>4.1 The problem</h3>
          <p>
            Auditors, customers and regulators want proof that a batch was made within
            specification. The evidence they ask for is raw time series, setpoints, ramp profiles
            and cycle timing, and that is often the know-how itself. Handing it over to prove
            compliance gives away the competitive advantage it was meant to protect.
          </p>
          <figure>
            <figcaption>Table 5. Ways to answer an audit</figcaption>
            <table>
              <thead>
                <tr><th scope="col">Approach</th><th scope="col">What is verified</th><th scope="col">Know-how</th></tr>
              </thead>
              <tbody>
                {APPROACHES.map((row) => (
                  <tr key={row.name}>
                    <td className="name">{row.name}</td>
                    <td>{row.compliance}</td>
                    <td>{row.knowHow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>

          <h3>4.2 Proposed construction</h3>
          <p>
            A prover running on the gateway would demonstrate that a committed process trace
            satisfies a defined predicate P over a specified time window W. The auditor checks the proof against the
            commitment; the readings themselves never leave the site.
          </p>
          <div className="twoCol">
            <div>
              <h4>Private, never leaves the site</h4>
              <ul>{PRIVATE_INPUTS.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <h4>Public, what the auditor sees</h4>
              <ul>{PUBLIC_OUTPUTS.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>

          <h3>4.3 Example</h3>
          <p>The public statement, which anyone can read and check the proof against:</p>
          <blockquote>
            &ldquo;For batch 0417, the recorded process temperature remained at or above 72 °C for
            at least 15 consecutive seconds (specification v1).&rdquo;
          </blockquote>
          <p>
            What stays private (illustrative figures) is that the line actually runs at 74.5 °C, with a two-stage ramp
            and an 18 s hold tuned for yield. That is the part a competitor would pay for. The
            proof does not disclose the private temperature trace or ramp profile, although
            public predicates and metadata may reveal limited information.
          </p>

          <h3>4.4 What a proof would and would not establish</h3>
          <div className="twoCol">
            <div>
              <h4>It would show</h4>
              <ul>{PROOF_SHOWS.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <h4>It would not show</h4>
              <ul>{PROOF_DOES_NOT_SHOW.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>

          <h3>4.5 Starting points and open problems</h3>
          <div className="twoCol">
            <div>
              <h4>Already built</h4>
              <ul>{HAVE_ALREADY.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <h4>Not built yet</h4>
              <ul>{STILL_MISSING.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>

          <p className="note">
            No zero-knowledge circuit, prover or verifier exists in this project today. This
            section describes the problem we are investigating and the parts of the current
            system it would rest on.
          </p>
        </section>

        <section id="roadmap" aria-labelledby="roadmap-title">
          <SectionHeading id="roadmap">Status and roadmap</SectionHeading>
          <p>
            Only the first group has run on hardware. The second is known engineering work. The
            third is open research.
          </p>
          {ROADMAP.map((group, index) => (
            <div key={group.title}>
              <h3>5.{index + 1} {group.title}</h3>
              <StatusLine status={group.status} />
              <ul>{group.items.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          ))}
        </section>

        <section id="live-lab" aria-labelledby="live-lab-title">
          <SectionHeading id="live-lab">Live Lab</SectionHeading>
          <p>
            The Live Lab is the original console: live warehouse-01 readings over Celerity, the
            desktop gateway and the paid actuator trigger. Sensor and gateway panels appear only
            on a machine that can reach the bench ESP32. Publishing and payment need the Polkadot
            Products host.
          </p>
          <p><a href="#lab">Open the Live Lab</a></p>
        </section>
      </article>

      <footer>
        Statement Store authenticates the Products host publisher; ESP32 device signing is not
        included yet. Zero-knowledge process proofs are research and are not implemented.
      </footer>
    </main>
  );
}
