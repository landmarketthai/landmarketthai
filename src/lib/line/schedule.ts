import { after } from "next/server";
import { dispatchNotifications } from "@/lib/line/outbox";

/** Prompt attempt only; the database outbox and independent scheduler provide recovery. */
export function scheduleNotifications(): void {
  if (process.env.LINE_NOTIFICATIONS_ENABLED !== "true") return;
  try {
    after(async () => {
      try { await dispatchNotifications(); }
      catch { console.error("[line-notifications] dispatch_unavailable"); }
    });
  } catch { console.error("[line-notifications] scheduling_unavailable"); }
}
