import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Mirrors the tsconfig exclude list. `contract` is a Hardhat project and
    // `experiments` is the ESP32 firmware and light-client work; both carry
    // their own runners (ctest, Hardhat) and define no vitest suite, so
    // collecting them here only produces "No test suite found" failures.
    exclude: [...configDefaults.exclude, "contract/**", "experiments/**"],
  },
});
