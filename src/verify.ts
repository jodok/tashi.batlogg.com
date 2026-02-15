import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify GitHub webhook HMAC-SHA256 signature.
 * Returns true if valid, false otherwise.
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;

  const expected = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  if (expected.length !== signature.length) return false;

  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
