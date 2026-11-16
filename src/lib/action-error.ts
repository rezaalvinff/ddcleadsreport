import "server-only";
import { ConfigurationError } from "./env";

/** Logs an unexpected server error and returns a message that is safe to show. */
export function actionErrorMessage(context: string, error: unknown): string {
  console.error(`[${context}]`, error);
  if (error instanceof ConfigurationError) return error.message;
  return error instanceof Error ? `${context}: ${error.message}` : `${context}: terjadi kesalahan tak terduga.`;
}
