export class TransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportError";
    Object.setPrototypeOf(this, TransportError.prototype);
  }
}

export class HttpError extends TransportError {
  public readonly status: number;
  public readonly metadata?: unknown;

  constructor(status: number, message: string, metadata?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.metadata = metadata;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

export class NetworkError extends TransportError {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "NetworkError";
    this.cause = cause;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class TimeoutError extends TransportError {
  constructor(message: string = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

export class CancellationError extends TransportError {
  constructor(message: string = "Request was cancelled") {
    super(message);
    this.name = "CancellationError";
    Object.setPrototypeOf(this, CancellationError.prototype);
  }
}

export class MalformedResponseError extends TransportError {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "MalformedResponseError";
    this.cause = cause;
    Object.setPrototypeOf(this, MalformedResponseError.prototype);
  }
}
