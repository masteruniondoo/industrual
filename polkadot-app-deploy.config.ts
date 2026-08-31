const deployConfig = {
  domain: "industrial.dot",
  displayName: "Industrial Sensor",
  description:
    "Live industrial temperature and humidity telemetry through local HTTP and Polkadot Statement Store.",
  icon: { path: "./public/industrial-icon.png", format: "png" },
  executables: [{ kind: "app", path: "./out", appVersion: [0, 10, 0] }],
};

export default deployConfig;
