import { describe, expect, it } from "vitest";
import { describeAuthError } from "@/lib/authErrors";

describe("登录错误提示", () => {
  it("邮箱已注册时提示去登录", () => {
    const info = describeAuthError("A user with this email address has already been registered");
    expect(info.canLogin).toBe(true);
    expect(info.text).toContain("直接登录");
  });

  it("密码错误不引导切换", () => {
    const info = describeAuthError("Invalid login credentials");
    expect(info.canLogin).toBe(false);
    expect(info.text).toContain("邮箱或密码");
  });

  it("邮箱未确认给出确认邮件提示", () => {
    expect(describeAuthError("Email not confirmed").text).toContain("确认邮件");
  });

  it("网络错误给出代理提示", () => {
    const info = describeAuthError("TypeError: fetch failed");
    expect(info.text).toContain("网络");
    expect(info.hint).toContain("代理");
  });

  it("未知错误原样返回", () => {
    expect(describeAuthError("something else").text).toBe("something else");
  });
});
