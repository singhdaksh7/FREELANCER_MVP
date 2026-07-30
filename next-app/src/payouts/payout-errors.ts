export class PayoutProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayoutProviderError";
  }
}

export class InvalidPayoutTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPayoutTransitionError";
  }
}

export class LiveProviderNotImplementedError extends PayoutProviderError {
  constructor(message = "No live payout provider is configured. Only test-mode simulation is available in this phase.") {
    super(message);
    this.name = "LiveProviderNotImplementedError";
  }
}
