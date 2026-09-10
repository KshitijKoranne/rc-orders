import assert from "node:assert/strict";
import test from "node:test";
import {
  derivePaymentStatus,
  isActiveOrderStatus,
  matchesRCodeSearch,
  normalizeRCode,
  orderTotal,
} from "../lib/order-logic.ts";

test("normalizes short and legacy R-codes to one lookup key", () => {
  assert.equal(normalizeRCode("17"), "R-0017");
  assert.equal(normalizeRCode("R-00017"), "R-0017");
  assert.equal(normalizeRCode("r17"), "R-0017");
});

test("does not turn zero-only R-code editing states into R-0000", () => {
  assert.equal(normalizeRCode("0"), "");
  assert.equal(normalizeRCode("R-00"), "");
  assert.equal(normalizeRCode("R-0000"), "");
});

test("finds catalogue items through common R-code shorthand", () => {
  for (const search of ["17", "r17", "R17", "R-17", "R-0017"]) {
    assert.equal(matchesRCodeSearch("R-0017", "Pendant", search), true, search);
  }
  assert.equal(matchesRCodeSearch("R-0017", "Pendant", "necklace"), false);
});

test("includes courier charges in the order total and payment state", () => {
  assert.equal(orderTotal([{ amount: 700 }, { amount: 250 }], 50), 1_000);
  assert.equal(derivePaymentStatus(1_000, 0), "Pending");
  assert.equal(derivePaymentStatus(1_000, 500), "Partial");
  assert.equal(derivePaymentStatus(1_000, 1_000), "Paid");
});

test("does not count delivered or cancelled orders as active", () => {
  assert.equal(isActiveOrderStatus("Delivered"), false);
  assert.equal(isActiveOrderStatus("Cancelled"), false);
  assert.equal(isActiveOrderStatus("Ready"), true);
});

test("sorts R-codes by serial number", async () => {
  const { compareRCode } = await import("../lib/order-logic.ts");
  const codes = ["R-0010", "R-10000", "R-0002", "R-0001"].map((rCode) => ({ rCode }));
  assert.deepEqual(codes.sort(compareRCode).map((c) => c.rCode), ["R-0001", "R-0002", "R-0010", "R-10000"]);
});

test("keeps one fragrance per unit", async () => {
  const { unitFragrances, storedFragrance, fragranceSummary } = await import("../lib/order-logic.ts");
  assert.deepEqual(unitFragrances("Rose", 2), ["Rose", "Rose"]);
  assert.deepEqual(unitFragrances("Rose, Jasmin", 3), ["Rose", "Jasmin", ""]);
  assert.deepEqual(unitFragrances("", 2), ["", ""]);
  assert.equal(storedFragrance("Rose, Rose", 2), "Rose");
  assert.equal(storedFragrance("Rose, Jasmin, Mogra", 2), "Rose, Jasmin");
  assert.equal(storedFragrance(", ", 2), "");
  assert.equal(fragranceSummary("Rose, Jasmin, Rose"), "Rose ×2, Jasmin");
});

test("a cost change applies to new orders only", async () => {
  const { orderCost, freezeItemCosts, costByRCode } = await import("../lib/order-logic.ts");
  const old = [{ items: [{ rCode: "R-0001", quantity: 2, amount: 200 }] }];
  const frozen = freezeItemCosts(old, "R-0001", 50);
  const costs = costByRCode([{ rCode: "R-0001", cost: 60 }]);
  assert.equal(orderCost(frozen[0].items, costs), 100); // old order keeps 50 each
  assert.equal(orderCost([{ rCode: "R-0001", quantity: 2, amount: 200, cost: 60 }], costs), 120);
  assert.equal(freezeItemCosts(old, "R-0001", 0), old); // no real cost yet: nothing frozen
  assert.equal(freezeItemCosts(frozen, "R-0001", 70)[0].items[0].cost, 50); // never re-stamped
});
