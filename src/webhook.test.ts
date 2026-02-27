import { test, expect } from "bun:test";
import { verifySignature } from "./webhook.ts";
import { createHmac } from "node:crypto";

const SECRET = "test-secret";

function sign(payload: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

test("verifySignature: valid signature returns true", () => {
  const payload = '{"action":"opened"}';
  const signature = sign(payload, SECRET);
  expect(verifySignature(payload, signature, SECRET)).toBe(true);
});

test("verifySignature: wrong secret returns false", () => {
  const payload = '{"action":"opened"}';
  const signature = sign(payload, "wrong-secret");
  expect(verifySignature(payload, signature, SECRET)).toBe(false);
});

test("verifySignature: null signature returns false", () => {
  expect(verifySignature("{}", null, SECRET)).toBe(false);
});

test("verifySignature: tampered payload returns false", () => {
  const signature = sign('{"action":"opened"}', SECRET);
  expect(verifySignature('{"action":"closed"}', signature, SECRET)).toBe(false);
});
