const deployConfig = {
  domain: "industrial.dot",
  displayName: "Industrial Sensor",
  description:
    "Industrial telemetry and paid actuator triggers through Polkadot Celerity and Asset Hub.",
  icon: { path: "./public/industrial-icon.png", format: "png" },
  executables: [{ kind: "app", path: "./out", appVersion: [0, 11, 0] }],
};

export default deployConfig;
