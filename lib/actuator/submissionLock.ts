export class DuplicateActuatorSubmissionError extends Error {
  constructor() {
    super("An actuator payment is already being submitted.");
    this.name = "DuplicateActuatorSubmissionError";
  }
}

export class ActuatorSubmissionLock {
  private pending = false;

  get isPending() {
    return this.pending;
  }

  async run<T>(submission: () => Promise<T>): Promise<T> {
    if (this.pending) throw new DuplicateActuatorSubmissionError();
    this.pending = true;
    try {
      return await submission();
    } finally {
      this.pending = false;
    }
  }
}
