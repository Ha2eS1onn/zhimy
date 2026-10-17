import { isIP } from "node:net";

/** 判断一个 IP 是否属于私网/回环/链路本地等不可访问地址（防 SSRF）。 */
export function isPrivateIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split(".").map((part) => Number.parseInt(part, 10));
    const [a, b] = parts;
    if (parts.length !== 4 || [a, b].some((value) => Number.isNaN(value as number))) return false;
    const first = a as number;
    const second = b as number;
    if (first === 0 || first === 10 || first === 127) return true;
    if (first === 169 && second === 254) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && second === 168) return true;
    if (first === 100 && second >= 64 && second <= 127) return true;
    if (first === 192 && second === 0 && parts[2] === 0) return true;
    if (first === 198 && (second === 18 || second === 19)) return true;
    if (first >= 224) return true;
    return false;
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fe80:")) return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length);
      return isPrivateIp(mapped);
    }
    return false;
  }
  return false;
}
