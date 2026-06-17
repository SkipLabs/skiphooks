import { timingSafeEqual, createHmac } from "node:crypto";

export function verifySignature(
  payload: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;

  const digest = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

  const digestBuf = Buffer.from(digest);
  const signatureBuf = Buffer.from(signature);

  // timingSafeEqual throws on unequal-length buffers, so compare byte
  // lengths first. A crafted signature with a multibyte char can share the
  // string length of the digest while differing in byte length — guard on
  // bytes, not string length, to avoid a 500 on malformed input.
  if (digestBuf.length !== signatureBuf.length) return false;

  return timingSafeEqual(digestBuf, signatureBuf);
}
