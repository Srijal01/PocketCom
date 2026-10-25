import test from "node:test";
import assert from "node:assert/strict";
import { createPairingCode, consumePairingCode } from "../src/pairing.js";

test("pairing codes are single-use", () => {
  const { code } = createPairingCode("owner");
  assert.equal(consumePairingCode(code), "owner");
  assert.equal(consumePairingCode(code), undefined);
});
