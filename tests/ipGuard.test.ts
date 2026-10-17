import { describe, expect, it } from "vitest";
import { isPrivateIp } from "@/lib/ai/ipGuard";

describe("SSRF 防护：私网地址识别", () => {
  it("识别 IPv4 私网与保留地址", () => {
    for (const address of [
      "10.1.2.3",
      "127.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.1.1",
      "100.64.0.1",
      "0.0.0.0",
      "198.18.0.1",
      "224.0.0.1",
    ]) {
      expect(isPrivateIp(address), address).toBe(true);
    }
  });

  it("公网 IPv4 不算私网", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "120.53.1.1"]) {
      expect(isPrivateIp(address), address).toBe(false);
    }
  });

  it("识别 IPv6 回环、链路本地与 ULA", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fd12::1")).toBe(true);
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
  });

  it("非法输入不误判", () => {
    expect(isPrivateIp("not-an-ip")).toBe(false);
  });
});
