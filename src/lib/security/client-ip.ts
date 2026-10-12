// Trusted ONLY behind Vercel's proxy, which sets x-real-ip / overwrites x-forwarded-for.
// Self-hosting behind another proxy (or none) lets clients spoof these headers: change this first.
import { isIP } from "node:net";

function expandIpv6(ip: string): number[] | null {
  let text = ip;
  const v4 = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4[1].split(".").map(Number);
    text = text.slice(0, -v4[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

export function clientIp(headers: Headers): string {
  const raw = headers.get("x-real-ip") || headers.get("x-forwarded-for")?.split(",")[0] || "";
  let candidate = raw.slice(0, 100).trim();
  const bracket = candidate.match(/^\[([^\]]*)\]/);
  if (bracket) candidate = bracket[1];
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(candidate)) candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  candidate = candidate.split("%")[0];
  const kind = isIP(candidate);
  if (kind === 4) return candidate;
  if (kind !== 6) return "unknown";
  const g = expandIpv6(candidate);
  if (!g) return "unknown";
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(":")}::/64`;
}
