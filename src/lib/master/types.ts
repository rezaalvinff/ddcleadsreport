import type { ReportingRegion } from "../constants";

export interface Dealer {
  id: string;
  dealer_name: string;
  city: string;
  province: string | null;
  reporting_region: ReportingRegion;
  is_active: boolean;
}

export interface WhatsappGroup {
  id: string;
  group_name: string;
  dealer_id: string | null;
  reporting_region: ReportingRegion;
  group_link: string | null;
  is_active: boolean;
  dealer_name: string | null;
}

/**
 * Groups recommended for a lead: those of the selected dealer first, then the
 * other active groups of the lead's reporting region.
 */
export function recommendGroups(
  groups: WhatsappGroup[],
  dealerId: string | null,
  region: ReportingRegion | null,
): { dealerGroups: WhatsappGroup[]; regionGroups: WhatsappGroup[] } {
  const active = groups.filter((g) => g.is_active);
  const dealerGroups = dealerId ? active.filter((g) => g.dealer_id === dealerId) : [];
  const regionGroups = region ? active.filter((g) => g.reporting_region === region && !dealerGroups.includes(g)) : [];
  return { dealerGroups, regionGroups };
}
