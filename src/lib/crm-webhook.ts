export async function sendCrmEvent(event: string, payload: Record<string, unknown>): Promise<boolean> {
  const webhookUrl = process.env.N8N_WEBHOOK_CRM;
  if (!webhookUrl) return false;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, occurred_at: new Date().toISOString(), ...payload }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[crm-webhook] event=${event} status=${response.status} body=${body}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[crm-webhook] event=${event} error`, error);
    return false;
  }
}
