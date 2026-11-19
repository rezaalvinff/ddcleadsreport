/**
 * WhatsApp handover is manual by design: the app prepares the text and opens
 * official WhatsApp URLs; the user sends the message themselves. There is no
 * WhatsApp automation of any kind.
 */

export const WHATSAPP_WEB_URL = "https://web.whatsapp.com/";
const INVITE_LINK = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}$/;

export interface HandoverLead {
  name: string;
  phone: string;
  domicile: string;
  unit: string;
  source: string;
  /** Free-text note from the prospect, woven into the closing line. */
  customerNote?: string | null;
}

const CLOSING = "Mohon untuk segera di follow up ya, terimakasih\u263A\uFE0F\uD83D\uDE4F\uD83C\uDFFB";

export function buildHandoverMessage(lead: HandoverLead): string {
  // The note leads the closing sentence, so drop any punctuation it ends with.
  const note = (lead.customerNote ?? "").trim().replace(/[.,;:\s]+$/, "");
  return [
    "Halo, saya mau info leads baru lagi berikut data customernya :",
    "",
    `Source : ${lead.source}`,
    `Nama : ${lead.name}`,
    `Nomer WA : ${lead.phone}`,
    `Tipe unit : ${lead.unit}`,
    `Domisili : ${lead.domicile}`,
    "",
    note ? `${note}, ${CLOSING}` : CLOSING,
  ].join("\n");
}

export function isValidGroupInviteLink(link: string): boolean {
  return INVITE_LINK.test(link.trim());
}

export type HandoverTarget =
  | { kind: "invite"; url: string; label: string; instruction: string }
  | { kind: "web"; url: string; label: string; instruction: string };

/** Where "open" should go for a group. A group name is never used as a link. */
export function handoverTarget(group: { group_name: string; group_link: string | null }): HandoverTarget {
  if (group.group_link && isValidGroupInviteLink(group.group_link)) {
    return {
      kind: "invite",
      url: group.group_link.trim(),
      label: "Buka link grup",
      instruction: `Link undangan grup "${group.group_name}" akan dibuka. Tempel pesan lalu kirim secara manual.`,
    };
  }
  return {
    kind: "web",
    url: WHATSAPP_WEB_URL,
    label: "Buka WhatsApp Web",
    instruction: `Grup "${group.group_name}" belum punya link undangan. Di WhatsApp Web, cari dan pilih grup tersebut secara manual, tempel pesan, lalu kirim.`,
  };
}

/** Writes the message to the clipboard; resolves only if the browser confirmed it. */
export async function copyHandoverMessage(clipboard: Pick<Clipboard, "writeText">, lead: HandoverLead): Promise<string> {
  const message = buildHandoverMessage(lead);
  await clipboard.writeText(message);
  return message;
}
