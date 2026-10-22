// The overview page. Everything here is static; the interactive console is
// the original page in LiveLab.tsx, shown in place at #lab by ViewSwitch.
// Every claim carries a Tag so a reader can tell what has run on the bench
// from what is only being investigated - see the "Where the line is" section
// before adding a new one.

import { ViewSwitch } from "./ViewSwitch";

type Status = "tested" | "next" | "research";

const STATUS_LABEL: Record<Status, string> = {
  tested: "Tested on hardware",
  next: "Engineering · not built",
  research: "Research · not built",
};

function Tag({ status }: { status: Status }) {
  return (
    <span className={`tag tag-${status}`}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

const HERO_STATS = [
  { value: "30+ h", label: "continuous telemetry from the bench to remote phones" },
  { value: "> 2/3", label: "GRANDPA weight checked on the ESP32 itself" },
  { value: "1 PAS", label: "on-chain trigger, one verified 60 s relay pulse" },
  { value: "0", label: "backend servers, databases or cloud controllers" },
];

const TELEMETRY_FLOW = [
  { name: "DHT11", detail: "temperature · humidity" },
  { name: "ESP32", detail: "wired read · /sensor.txt" },
  { name: "Desktop gateway", detail: "industrial.dot in the Products host" },
  { name: "Celerity", detail: "signed Statement Store messages" },
  { name: "Remote clients", detail: "desktop · Android · iPhone" },
];

const CONTROL_FLOW = [
  { name: "1 PAS payment", detail: "from any Products wallet" },
  { name: "Actuator contract", detail: "triggerNonce + 1 on Asset Hub" },
  { name: "GRANDPA finality", detail: "Paseo relay chain" },
  { name: "ESP32 light client", detail: "verifies every proof itself" },
  { name: "Relay · fan", detail: "GPIO18 · 60 s" },
];

const EVIDENCE = [
  {
    title: "Continuous telemetry",
    body: "DHT11 readings travelled from the ESP32 through the desktop gateway and Celerity to remote Products clients for more than 30 hours without a backend. Clients mark a signal LIVE, STALE or NO SIGNAL from its age.",
  },
  {
    title: "Finality verified on the device",
    body: "The ESP32 checks Ed25519 GRANDPA justifications against an authority set it already trusts and requires strictly more than two thirds of the weight. RPC nodes and peers only supply bytes.",
  },
  {
    title: "A proof chain down to one slot",
    body: "Relay state root → Paras.Heads(1000) → Asset Hub header → contract info with a pinned trie id → child trie slot 0 → the nonce. A proof for any other contract is rejected.",
  },
  {
    title: "Authority-set rotations",
    body: "Scheduled GRANDPA set changes are derived on the device and committed to flash with A/B slots and readback. The 248→249 rotation is fixture-tested; 250→251 was followed live on the bench.",
  },
  {
    title: "Warp sync over libp2p",
    body: "When its anchor falls too far behind, the device recovers over plain-TCP libp2p with Noise XX, Yamux and PeerId enforcement, verifying every warp fragment before it trusts it.",
  },
  {
    title: "Payment to physical pulse",
    body: "Paying exactly 1 PAS increments the contract nonce. The ESP32 verifies the new nonce, writes it to flash before driving the pin, and holds the fan for 60 seconds. Replays and lower nonces are refused.",
  },
];

const FIRMWARE_FACTS = [
  { label: "Flash", value: "77.3% of 1.31 MB" },
  { label: "Static RAM", value: "124 KB of 320 KB" },
  { label: "Native tests", value: "10 / 10 passing" },
  { label: "Contract", value: "0x0863…3374 · para 1000" },
];

const CANNOT_ACTUATE = [
  "An RPC response",
  "A P2P peer",
  "An HTTP request",
  "Celerity",
  "industrial.dot",
  "A reboot",
  "A claimed nonce",
];

const PRIVATE_INPUTS = [
  "Raw sensor trace for the batch",
  "Recipe setpoints and ramp profile",
  "Cycle timing and tolerances",
  "Line and equipment configuration",
];

const PUBLIC_OUTPUTS = [
  "Commitment to the trace, anchored on chain",
  "The predicate and spec version it was checked against",
  "Batch identifier and time window",
  "Pass, plus a proof anyone can verify",
];

const HAVE_ALREADY = [
  "A device that verifies chain state on its own instead of trusting a server",
  "An on-chain anchor on Asset Hub that the device reads through proofs",
  "A signed path that carries telemetry off the shop floor",
];

const STILL_MISSING = [
  "Readings signed by the device. Today the Products host signs the publication; the ESP32 does not sign its readings.",
  "A commitment scheme for long, high-rate time series",
  "A choice of proof system and circuit for range, duration and ordering predicates",
  "Where the prover runs: the gateway, not the microcontroller, is the realistic first host",
  "Proof verification on PolkaVM, or off-chain verification by the auditor",
  "Metadata leakage: how often proofs appear can still reveal throughput",
];

const ROADMAP: { status: Status; title: string; items: string[] }[] = [
  {
    status: "tested",
    title: "Now",
    items: [
      "DHT11 → ESP32 → gateway → Celerity telemetry",
      "Paid trigger on the Asset Hub contract",
      "On-device GRANDPA and trie-proof verification",
      "Authority-set rotation and warp-sync recovery",
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
      "Measured stack and heap margins",
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

function Flow({ steps }: { steps: { name: string; detail: string }[] }) {
  return (
    <ol className="flow">
      {steps.map((step) => (
        <li key={step.name} className="flowStep">
          <strong>{step.name}</strong>
          <span>{step.detail}</span>
        </li>
      ))}
    </ol>
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
        <div className="siteLinks">
          <nav aria-label="Sections">
            <a href="#how">How it works</a>
            <a href="#evidence">Evidence</a>
            <a href="#privacy">Process privacy</a>
            <a href="#roadmap">Roadmap</a>
          </nav>
          <a className="navCta" href="#lab">Live Lab →</a>
        </div>
      </header>

      <section className="homeHero" aria-labelledby="hero-title">
        <h2 id="hero-title">Infrastructure for Industry</h2>
        <p className="heroPillars">
          Decentralized Architecture. Privacy by Design. Verified Actions.
        </p>
        <p className="lead">
          A shared layer designed to integrate across industries — without relying on trusted
          central servers.
        </p>
        <p className="lead">
          Secure authentication, decentralized communication through Celerity, cryptographically
          verified actions, and tamper-evident command histories.
        </p>
        <p className="lead">
          From machines acting on verified commands to proving product quality without revealing
          proprietary processes, we’re exploring a new foundation for industrial automation,
          quality assurance, and digital product passports.
        </p>
        <p className="heroClosing">
          Protect industrial know-how. Verify processes. Connect businesses without intermediaries.
        </p>

        <div className="legend" aria-label="How claims on this page are labelled">
          <div><Tag status="tested" /><p>Built, run on the bench, and evidenced.</p></div>
          <div><Tag status="next" /><p>Known engineering work. Not built yet.</p></div>
          <div><Tag status="research" /><p>A direction under investigation. No code exists.</p></div>
        </div>

        <dl className="statStrip">
          {HERO_STATS.map((stat) => (
            <div key={stat.value}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="how" className="homeSection" aria-labelledby="how-title">
        <div className="sectionIntro">
          <span className="eyebrow">HOW IT WORKS</span>
          <h2 id="how-title">Two loops, one trust boundary</h2>
          <p>
            Telemetry and control travel separate paths. Observation flows outward through
            Celerity; activation only ever comes from state the device has proven for itself.
          </p>
        </div>

        <div className="loopGrid">
          <article className="panel loopPanel">
            <div className="sectionHeading">
              <div><span className="eyebrow">TELEMETRY LOOP</span><h3>Bench to phone</h3></div>
              <Tag status="tested" />
            </div>
            <Flow steps={TELEMETRY_FLOW} />
          </article>
          <article className="panel loopPanel">
            <div className="sectionHeading">
              <div><span className="eyebrow">CONTROL LOOP</span><h3>Payment to relay</h3></div>
              <Tag status="tested" />
            </div>
            <Flow steps={CONTROL_FLOW} />
          </article>
        </div>
        <p className="note">
          Celerity is observation only. The ESP32 firmware has no Celerity client and no HTTP
          write route, so nothing published there can reach the relay.
        </p>
      </section>

      <section id="evidence" className="homeSection" aria-labelledby="evidence-title">
        <div className="sectionIntro">
          <Tag status="tested" />
          <h2 id="evidence-title">What has actually run</h2>
          <p>
            Each item below has run on the ESP32 on the bench against the public Paseo network,
            not in a simulator.
          </p>
        </div>

        <div className="evidenceGrid">
          {EVIDENCE.map((item) => (
            <article key={item.title} className="panel evidenceCard">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>

        <dl className="factStrip">
          {FIRMWARE_FACTS.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>

        <div className="panel invariantPanel">
          <div>
            <span className="eyebrow">SECURITY INVARIANT</span>
            <h3>None of these can move the relay</h3>
            <p>
              Each can only supply bytes that the device verifies again, or be ignored. The pin
              moves only for a finalized, proven nonce higher than the one already stored.
            </p>
          </div>
          <ul className="chipList">
            {CANNOT_ACTUATE.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </section>

      <section id="privacy" className="homeSection privacySection" aria-labelledby="privacy-title">
        <div className="sectionIntro">
          <Tag status="research" />
          <span className="eyebrow">PROCESS PRIVACY</span>
          <h2 id="privacy-title">Prove the process was compliant without revealing it.</h2>
          <p>
            Auditors, customers and regulators want proof that a batch was made within
            specification. The evidence they ask for is raw time series, setpoints, ramp
            profiles and cycle timing, and that is often the know-how itself. Handing it over
            to prove compliance gives away the competitive moat it was meant to protect.
          </p>
        </div>

        <div className="tradeoffGrid">
          <div className="panel tradeoff">
            <span className="eyebrow">SHARE THE DATA</span>
            <p><b className="good">Compliance proven</b><b className="bad">Know-how exposed</b></p>
          </div>
          <div className="panel tradeoff">
            <span className="eyebrow">WITHHOLD IT</span>
            <p><b className="good">Know-how kept</b><b className="bad">Compliance taken on trust</b></p>
          </div>
          <div className="panel tradeoff tradeoffZk">
            <span className="eyebrow">ZERO-KNOWLEDGE PROOF</span>
            <p><b className="good">Compliance proven</b><b className="good">Know-how stays on site</b></p>
          </div>
        </div>

        <div className="zkDiagram" role="group" aria-label="Proposed zero-knowledge compliance flow">
          <div className="zkColumn zkPrivate">
            <span className="eyebrow">PRIVATE · NEVER LEAVES THE SITE</span>
            <ul>{PRIVATE_INPUTS.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="zkProver">
            <span className="eyebrow">PROVER ON THE GATEWAY</span>
            <strong>Every committed reading in window W satisfies predicate P</strong>
          </div>
          <div className="zkColumn zkPublic">
            <span className="eyebrow">PUBLIC · WHAT THE AUDITOR SEES</span>
            <ul>{PUBLIC_OUTPUTS.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>

        <div className="panel exampleGrid">
          <div>
            <span className="eyebrow">PUBLIC STATEMENT</span>
            <p>&ldquo;Core temperature held at or above <b>72 °C</b> for at least <b>15 s</b>, for every unit in batch 0417.&rdquo;</p>
            <small>The regulator&apos;s limit. Anyone can read it and check the proof against it.</small>
          </div>
          <div>
            <span className="eyebrow">STAYS PRIVATE</span>
            <p>That the line actually runs at 74.5 °C, with a two-stage ramp and an 18 s hold tuned for yield.</p>
            <small>The part a competitor would pay for. The proof reveals none of it.</small>
          </div>
        </div>

        <div className="claimGrid">
          <div className="panel claimPanel">
            <span className="eyebrow">A PROOF WOULD SHOW</span>
            <ul>
              <li>The committed trace satisfies the published predicate.</li>
              <li>The trace is the one committed at production time, not a version edited afterwards.</li>
              <li>Which specification version it was checked against.</li>
            </ul>
          </div>
          <div className="panel claimPanel claimLimit">
            <span className="eyebrow">A PROOF WOULD NOT SHOW</span>
            <ul>
              <li>That the sensor told the truth. A proof over fabricated readings is still a valid proof.</li>
              <li>That the sensor was installed where the specification says it should be.</li>
              <li>Anything about batches that were never committed.</li>
            </ul>
          </div>
        </div>

        <div className="buildingBlocks">
          <div className="panel">
            <div className="sectionHeading">
              <h3>What we can build on</h3>
              <Tag status="tested" />
            </div>
            <ul>{HAVE_ALREADY.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="panel researchPanel">
            <div className="sectionHeading">
              <h3>What does not exist yet</h3>
              <Tag status="research" />
            </div>
            <ul>{STILL_MISSING.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>

        <p className="note">
          No zero-knowledge circuit, prover or verifier exists in this project today. This
          section describes the problem we are investigating and the parts of the current
          system it would rest on.
        </p>
      </section>

      <section id="roadmap" className="homeSection" aria-labelledby="roadmap-title">
        <div className="sectionIntro">
          <span className="eyebrow">WHERE THE LINE IS</span>
          <h2 id="roadmap-title">Tested, next, and research</h2>
          <p>
            Only the first column has run on hardware. The second is known engineering work.
            The third is open research.
          </p>
        </div>
        <div className="roadmapGrid">
          {ROADMAP.map((column) => (
            <article key={column.title} className={`panel roadmapColumn roadmap-${column.status}`}>
              <div className="sectionHeading">
                <h3>{column.title}</h3>
                <Tag status={column.status} />
              </div>
              <ul>{column.items.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="panel labCta" aria-labelledby="lab-title">
        <div>
          <span className="eyebrow">LIVE LAB</span>
          <h2 id="lab-title">Watch the bench</h2>
          <p>
            The Live Lab is the original console: live warehouse-01 readings over Celerity,
            the desktop gateway and the paid actuator trigger. Sensor and gateway panels appear
            only on a machine that can reach the bench ESP32. Publishing and payment need the
            Polkadot Products host.
          </p>
        </div>
        <a className="primaryButton linkButton" href="#lab">Open the Live Lab</a>
      </section>

      <footer>
        Statement Store authenticates the Products host publisher; ESP32 device signing is not
        included yet. Zero-knowledge process proofs are research and are not implemented.
      </footer>
    </main>
  );
}
