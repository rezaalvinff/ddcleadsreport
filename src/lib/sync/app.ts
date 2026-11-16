import "server-only";
import { getAdminDb } from "../db/admin";
import { createGoogleSheetsGateway, type SheetsGateway } from "../sheets/gateway";
import type { SyncDeps } from "./service";
import { createSupabaseSyncStore } from "./store";

export function appSyncDeps(): SyncDeps {
  let gateway: SheetsGateway | null = null;
  return {
    store: createSupabaseSyncStore(getAdminDb()),
    getSheets: () => (gateway ??= createGoogleSheetsGateway()),
  };
}
