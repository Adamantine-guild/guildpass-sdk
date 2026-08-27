/** A function used to estimate one item's serialized payload size. */
export type BatchSizeEstimator<T> = (item: T) => number;

/** Configuration for {@link planBatches}. */
export interface BatchPlannerOptions<T> {
  /** The maximum number of items in one batch. */
  readonly maxItemsPerBatch: number;
  /** The maximum estimated payload size in bytes for one batch. */
  readonly maxEstimatedBytesPerBatch: number;
  /** Returns the estimated payload size for one item. */
  readonly estimateSize: BatchSizeEstimator<T>;
}

/** Machine-readable validation failures raised by {@link planBatches}. */
export type BatchPlanningErrorCode = "INVALID_LIMIT" | "INVALID_SIZE_ESTIMATE" | "ITEM_TOO_LARGE";

/** A structured error raised when a batch plan cannot satisfy its limits. */
export class BatchPlanningError extends RangeError {
  constructor(
    public readonly code: BatchPlanningErrorCode,
    message: string,
    public readonly itemIndex?: number,
    public readonly estimatedBytes?: number,
  ) {
    super(message);
    this.name = "BatchPlanningError";
  }
}

function validateLimit(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new BatchPlanningError("INVALID_LIMIT", `${name} must be a positive integer`);
  }
}

/**
 * Partitions ordered items into deterministic batches under item and payload limits.
 * The input array stays unchanged, and the estimator runs once per item.
 *
 * An item whose estimate exceeds the payload limit raises a structured error rather
 * than producing an invalid oversized batch.
 */
export function planBatches<T>(items: readonly T[], options: BatchPlannerOptions<T>): T[][] {
  validateLimit(options.maxItemsPerBatch, "maxItemsPerBatch");
  validateLimit(options.maxEstimatedBytesPerBatch, "maxEstimatedBytesPerBatch");

  const batches: T[][] = [];
  let currentBatch: T[] = [];
  let currentEstimatedBytes = 0;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex] as T;
    const estimatedBytes = options.estimateSize(item);

    if (!Number.isFinite(estimatedBytes) || estimatedBytes < 0) {
      throw new BatchPlanningError(
        "INVALID_SIZE_ESTIMATE",
        `size estimate for item ${itemIndex} must be finite and non-negative`,
        itemIndex,
        estimatedBytes,
      );
    }

    if (estimatedBytes > options.maxEstimatedBytesPerBatch) {
      throw new BatchPlanningError(
        "ITEM_TOO_LARGE",
        `item ${itemIndex} estimate ${estimatedBytes} exceeds maxEstimatedBytesPerBatch ${options.maxEstimatedBytesPerBatch}`,
        itemIndex,
        estimatedBytes,
      );
    }

    const exceedsItemLimit = currentBatch.length >= options.maxItemsPerBatch;
    const exceedsPayloadLimit =
      estimatedBytes > options.maxEstimatedBytesPerBatch - currentEstimatedBytes;

    if (currentBatch.length > 0 && (exceedsItemLimit || exceedsPayloadLimit)) {
      batches.push(currentBatch);
      currentBatch = [];
      currentEstimatedBytes = 0;
    }

    currentBatch.push(item);
    currentEstimatedBytes += estimatedBytes;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}
