// Mobile hosts can suspend a subscription while showing their payment UI.
// Some report a focus/visibility event; others only stop delivering messages.
export function watchCelerityConnection(options: {
  reconnect: () => boolean;
  lastReceivedAt: () => number;
}) {
  let lastAttemptAt = Date.now();
  let resumePending = false;

  function check() {
    if (document.visibilityState === "hidden") return;
    const now = Date.now();
    // Coalesce focus, pageshow and visibilitychange from the same return.
    if (now - lastAttemptAt < 1_000) return;
    if (!resumePending && now - Math.max(lastAttemptAt, options.lastReceivedAt()) < 60_000) return;
    if (options.reconnect()) {
      lastAttemptAt = now;
      resumePending = false;
    }
  }

  function resume() {
    if (document.visibilityState === "hidden") return;
    if (Date.now() - lastAttemptAt < 1_000) return;
    resumePending = true;
    check();
  }

  document.addEventListener("visibilitychange", resume);
  window.addEventListener("focus", resume);
  window.addEventListener("pageshow", resume);
  const timer = window.setInterval(check, 5_000);

  return () => {
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("focus", resume);
    window.removeEventListener("pageshow", resume);
    window.clearInterval(timer);
  };
}
