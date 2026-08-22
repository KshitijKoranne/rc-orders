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
