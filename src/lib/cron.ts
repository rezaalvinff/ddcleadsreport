import { timingSafeEqual } from "node:crypto";

/** Constant-time check of the `Authorization: Bearer <CRON_SECRET>` header Vercel Cron sends. */
export function isAuthorizedCron(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
