import { describe, expect, it } from "vitest";
import { BatchPlanningError, planBatches } from "../src/utils/batchPlanner.js";

describe("planBatches", () => {
  const byLength = (item: string) => item.length;

  it("returns one batch for items within both limits", () => {
    expect(
      planBatches(["aa", "bbb", "c"], {
        maxItemsPerBatch: 4,
        maxEstimatedBytesPerBatch: 6,
        estimateSize: byLength,
      }),
    ).toEqual([["aa", "bbb", "c"]]);
  });

  it("splits at an exact item-count boundary", () => {
    expect(
      planBatches([1, 2, 3, 4], {
        maxItemsPerBatch: 2,
        maxEstimatedBytesPerBatch: 100,
        estimateSize: () => 1,
      }),
    ).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("splits when the next item would exceed the payload boundary", () => {
    expect(
      planBatches([2, 3, 1], {
        maxItemsPerBatch: 10,
        maxEstimatedBytesPerBatch: 5,
        estimateSize: (item) => item,
      }),
    ).toEqual([[2, 3], [1]]);
  });

  it("enforces item-count and payload limits together", () => {
    expect(
      planBatches([2, 2, 2, 2], {
        maxItemsPerBatch: 2,
        maxEstimatedBytesPerBatch: 5,
        estimateSize: (item) => item,
      }),
    ).toEqual([
      [2, 2],
      [2, 2],
    ]);
  });

  it("preserves order and does not mutate the input array", () => {
    const items = Object.freeze(["first", "second", "third"]);
    const batches = planBatches(items, {
      maxItemsPerBatch: 1,
      maxEstimatedBytesPerBatch: 100,
      estimateSize: () => 1,
    });

    expect(batches.flat()).toEqual(["first", "second", "third"]);
    expect(items).toEqual(["first", "second", "third"]);
  });

  it("returns no batches for empty input", () => {
    expect(
      planBatches([], {
        maxItemsPerBatch: 1,
        maxEstimatedBytesPerBatch: 1,
        estimateSize: () => 1,
      }),
    ).toEqual([]);
  });

  it("allows zero-byte items at exact boundaries", () => {
    expect(
      planBatches(["a", "b"], {
        maxItemsPerBatch: 2,
        maxEstimatedBytesPerBatch: 1,
        estimateSize: () => 0,
      }),
    ).toEqual([["a", "b"]]);
  });

  it("rejects invalid limits", () => {
    for (const maxItemsPerBatch of [0, -1, 1.5, Number.NaN, Infinity]) {
      expect(() =>
        planBatches(["item"], {
          maxItemsPerBatch,
          maxEstimatedBytesPerBatch: 10,
          estimateSize: () => 1,
        }),
      ).toThrow(BatchPlanningError);
    }

    expect(() =>
      planBatches(["item"], {
        maxItemsPerBatch: 1,
        maxEstimatedBytesPerBatch: -1,
        estimateSize: () => 1,
      }),
    ).toThrow(BatchPlanningError);
  });

  it("rejects negative and non-finite size estimates", () => {
    for (const estimateSize of [() => -1, () => Number.NaN, () => Infinity]) {
      try {
        planBatches(["item"], {
          maxItemsPerBatch: 1,
          maxEstimatedBytesPerBatch: 10,
          estimateSize,
        });
        throw new Error("expected planBatches to reject the estimate");
      } catch (error) {
        expect(error).toMatchObject({
          name: "BatchPlanningError",
          code: "INVALID_SIZE_ESTIMATE",
          itemIndex: 0,
        });
      }
    }
  });

  it("rejects an individual item larger than the payload limit", () => {
    try {
      planBatches(["small", "too-large"], {
        maxItemsPerBatch: 2,
        maxEstimatedBytesPerBatch: 5,
        estimateSize: byLength,
      });
      throw new Error("expected planBatches to reject the oversized item");
    } catch (error) {
      expect(error).toMatchObject({
        name: "BatchPlanningError",
        code: "ITEM_TOO_LARGE",
        itemIndex: 1,
        estimatedBytes: 9,
      });
    }
  });

  it("handles large collections in one forward pass", () => {
    const items = Array.from({ length: 10_000 }, (_, index) => index);
    let estimateCalls = 0;
    const batches = planBatches(items, {
      maxItemsPerBatch: 100,
      maxEstimatedBytesPerBatch: 10_000,
      estimateSize: () => {
        estimateCalls += 1;
        return 1;
      },
    });

    expect(batches).toHaveLength(100);
    expect(batches.flat()).toEqual(items);
    expect(estimateCalls).toBe(items.length);
  });
});
