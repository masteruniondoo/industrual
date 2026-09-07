// Bound the entire sensor read, including the response body. Some embedded
// fetch implementations do not settle promptly when their signal is aborted.
export function sensorRequest<T>(
  read: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 8_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      reject(new Error(`ESP32 HTTP request timed out after ${timeoutMs / 1_000}s`));
      controller.abort();
    }, timeoutMs);
    Promise.resolve().then(() => read(controller.signal)).then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}
