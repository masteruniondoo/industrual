# Industrial.dot

Industrial.dot is an IoT demonstration of real-time sensor-message delivery through Polkadot Celerity, without a centralized backend. It is deployed as a Next.js static Polkadot Product bundle on `industrial.dot`.

## Application flow

1. **Physical sensing** — A DHT11 sensor measures temperature and humidity and sends the values to an ESP32 through a wired connection.

2. **Local Wi-Fi communication** — The ESP32 connects to the local Wi-Fi network and runs a small HTTP server. It exposes the current reading at:

   ```text
   http://192.168.1.42/sensor.txt
   ```

   The response format is:

   ```text
   T=23.0,H=48.0
   ```

3. **Desktop gateway** — A desktop computer on the same Wi-Fi network runs `industrial.dot` inside the Polkadot Products host. It fetches the ESP32 endpoint every 10 seconds, parses the response, and validates both values. This implementation is in [components/LocalSensorTest.tsx](components/LocalSensorTest.tsx).

4. **Celerity publishing** — The desktop application acts as a gateway between the local sensor network and Celerity. The Products host provides the publisher account and Statement Store allowance. A signed reading is published every 30 seconds to the `warehouse-01` topic. This implementation is in [app/page.tsx](app/page.tsx).

5. **Remote distribution** — Celerity distributes the signed message to subscribed Products clients. Remote devices do not need to be connected to the ESP32's local Wi-Fi network.

6. **Remote clients (Desktop / Android / iPhone)** — There is no platform-specific implementation; every client runs the same `app/page.tsx` inside the common Polkadot Products host and connects to Statement Store in `host` mode (`app/page.tsx:294`), subscribing to the same `warehouse-01` topic (`app/page.tsx:301`). It displays temperature, humidity, message age, and publisher address. The local sensor and gateway controls stay hidden on any client where the ESP32 endpoint is unavailable.

7. **Monitoring status** — Readings are classified as `LIVE` (< 45s), `STALE` (45–90s), or `NO SIGNAL` (> 90s). The application keeps the latest 20 received messages in memory.

8. **Demo result** — The system transmitted readings continuously for more than 30 hours, demonstrating:

   ```text
   DHT11
     → wired connection
   ESP32
     → local Wi-Fi / HTTP
   Desktop industrial.dot gateway
     → signed Celerity statements
   Statement Store
     → remote Products clients
   Desktop / Android / iPhone
   ```

The readings are temporary Celerity messages and are not currently stored in a database, smart contract, or Bulletin. Statement Store authenticates the Products host publisher; ESP32 device signing is not included.

## What it listens to

- `appName`: `industrial` → automatically hashed by the SDK as primary topic (`topic1`)
- `topic2`: `warehouse-01`

Expected payload:

```json
{
  "type": "env",
  "sensor": "WAREHOUSE-01",
  "temperature": 18.7,
  "humidity": 67.2,
  "timestamp": 1787503500000
}
```

## Run

```bash
npm install
npm run dev
```

Note: the physical sensor panel only appears when `http://192.168.1.42/sensor.txt` is reachable from the machine running the app. Without a local ESP32 on the network, the app still connects to Celerity and displays any `warehouse-01` readings published by other gateways.

## `industrial.dot` deployment

The application is configured as a static Polkadot Product bundle for Products
Devnet. `next build` writes the deployable files to `out/`; the product manifest
is in `polkadot-app-deploy.config.ts` and registers the app executable on
`app.industrial.dot`.

Requirements:

- Node.js 22+
- `@parity/polkadot-app-deploy` (`pad`) installed globally
- a funded Products Devnet wallet with Bulletin upload allowance

Create a dedicated encrypted account before the first deployment. Run this
interactively in your own terminal, enter a new keystore password, and copy the
mnemonic shown once into a password manager:

```powershell
npm.cmd run account:create
```

Do not send the mnemonic through chat and do not save it in the repository.

Build and run the local preflight without changing on-chain state:

```powershell
npm.cmd run build
npm.cmd run check:devnet
```

Deploy with an existing wallet session:

```powershell
npm.cmd run login:devnet
npm.cmd run whoami:devnet
npm.cmd run deploy:devnet
```

Or enter the owner's mnemonic securely when prompted:

```powershell
npm.cmd run deploy:devnet:secure
```

The deploy command uploads `out/` to Bulletin Chain and registers or updates
`industrial.dot` through DotNS. Never put a mnemonic in this repository, a
command line, `.env`, or chat. A different eligible `.dot` name can be checked
or deployed by passing it after `--`, for example:

```powershell
npm.cmd run check:devnet -- another-domain.dot
npm.cmd run deploy:devnet -- another-domain.dot
```

For the real Statement Store host path, open the app inside the Polkadot Desktop/Mobile product container so a host account is exposed. The receiver currently uses host mode intentionally.

## Current behavior

1. The Products host exposes a publisher account; `StatementStoreClient` connects through the host-authorized Statement Store path in `host` mode.
2. `LocalSensorTest` polls `http://192.168.1.42/sensor.txt` every 10 seconds, parses `T=…,H=…`, and validates both values.
3. When a valid physical reading is available, the desktop gateway publishes it to `topic2 = warehouse-01` every 30 seconds (manual publish and an allowance-request flow are also available).
4. Every client (desktop, Android, iPhone) subscribes to `topic2 = warehouse-01` and updates the temperature/humidity display from received statements.
5. A signal is `LIVE` below 45 seconds, `STALE` from 45–90 seconds, and `NO SIGNAL` after 90 seconds.
6. Up to 20 recent Celerity readings are kept in memory only.
7. The physical-sensor and gateway-publishing panels are hidden on any client where the local ESP32 endpoint is not reachable.

No backend, database, persistent storage, or smart contract is included. ESP32 firmware is not part of this repository.
