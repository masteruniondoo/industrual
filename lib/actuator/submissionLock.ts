export class DuplicateActuatorSubmissionError extends Error {
  constructor() {
    super("An actuator payment is already being submitted.");
    this.name = "DuplicateActuatorSubmissionError";
  }
}

/**
 * One payment at a time.
 *
 * It used to carry a reset and a generation guard, because a submission
 * abandoned mid-signature never settled and held the lock for the life of the
 * page. The submission is now bounded by its own timeout, so it always settles
 * and the lock always releases — and with the manual session reset gone there
 * is nothing left that can cancel a submission out from under this.
 */
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
