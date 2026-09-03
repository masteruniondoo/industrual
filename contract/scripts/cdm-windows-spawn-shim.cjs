const childProcess = require("node:child_process");

if (process.platform === "win32") {
  const originalSpawn = childProcess.spawn;
  const originalSpawnSync = childProcess.spawnSync;

  childProcess.spawn = function spawn(command, args = [], options = {}) {
    if (command === "npx") {
      return originalSpawn.call(
        this,
        process.env.ComSpec || "cmd.exe",
        ["/d", "/s", "/c", "npx.cmd", ...args],
        options,
      );
    }
    return originalSpawn.call(this, command, args, options);
  };

  childProcess.spawnSync = function spawnSync(command, args = [], options = {}) {
    if (command === "npx") {
      return originalSpawnSync.call(
        this,
        process.env.ComSpec || "cmd.exe",
        ["/d", "/s", "/c", "npx.cmd", ...args],
        options,
      );
    }
    return originalSpawnSync.call(this, command, args, options);
  };
}
