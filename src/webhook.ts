import { timingSafeEqual, createHmac } from "node:crypto";

export function verifySignature(
  payload: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;

  const digest = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

  if (digest.length !== signature.length) return false;

  return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}
