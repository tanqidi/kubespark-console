export function formatAge(ts?: string): string {
  if (!ts) return "-";
  const created = Date.parse(ts);
  if (Number.isNaN(created)) return "-";
  const diffMs = Date.now() - created;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months}mo`;
  const years = Math.floor(months / 12);
  return `${years}y`;
}

export function formatDateTime(ts?: string): string {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function parseQuantityCpu(q?: string): number {
  if (!q) return 0;
  if (q.endsWith("m")) return Number(q.replace("m", "")) / 1000;
  return Number(q);
}

export function parseQuantityMemGi(q?: string): number {
  if (!q) return 0;
  const lower = q.toLowerCase();
  const map: Record<string, number> = { ki: 1024, mi: 1024 ** 2, gi: 1024 ** 3, ti: 1024 ** 4 };
  const match = lower.match(/^([0-9.]+)([a-z]+)?$/);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2] || "";
  if (map[unit]) return (value * map[unit]) / 1024 ** 3;
  return value / 1024 ** 3;
}
