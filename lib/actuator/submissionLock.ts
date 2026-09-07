export class DuplicateActuatorSubmissionError extends Error {
  constructor() {
    super("An actuator payment is already being submitted.");
    this.name = "DuplicateActuatorSubmissionError";
  }
}

export class StaleActuatorSubmissionError extends Error {
  constructor() {
    super("This actuator payment was superseded by a session reset.");
    this.name = "StaleActuatorSubmissionError";
  }
}

export class ActuatorSubmissionLock {
  private pending = false;
  private generation = 0;

  get isPending() {
    return this.pending;
  }

  // Frees the lock and disowns whatever is still in flight. A submission
  // abandoned mid-signature never settles, so without this the lock stays held
  // for the life of the page and every later payment is refused as a duplicate.
  reset(): void {
    this.generation += 1;
    this.pending = false;
  }

  async run<T>(submission: () => Promise<T>): Promise<T> {
    if (this.pending) throw new DuplicateActuatorSubmissionError();

    const generation = (this.generation += 1);
    this.pending = true;
    try {
      const value = await submission();
      // A reset while this was running means the caller has moved on; its
      // result must not be reported as the outcome of the current attempt.
      if (generation !== this.generation) throw new StaleActuatorSubmissionError();
      return value;
    } finally {
      // Only the current owner may release, or a late straggler would unlock a
      // payment that legitimately started after the reset.
      if (generation === this.generation) this.pending = false;
    }
  }
}
