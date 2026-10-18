/** 把 Supabase Auth 的英文错误翻译成可操作的中文提示。 */

export interface AuthErrorInfo {
  text: string;
  /** 错误是否意味着"这个邮箱已有账号，应该去登录"。 */
  canLogin: boolean;
  hint?: string;
}

export function describeAuthError(message: string): AuthErrorInfo {
  const text = (message || "").toLowerCase();

  if (/already (been )?registered|user already registered|already exists/.test(text)) {
    return {
      text: "这个邮箱已经注册过账号了，不需要再绑定 —— 直接登录即可。",
      canLogin: true,
      hint: "切换到「登录已有账号」，用这个邮箱和密码登录，就能看到原来的知识图谱。",
    };
  }
  if (/invalid (login|credentials)|invalid_grant|invalid password|wrong password/.test(text)) {
    return { text: "邮箱或密码不正确，请检查后重试。", canLogin: false };
  }
  if (/email not confirmed|not confirmed/.test(text)) {
    return {
      text: "邮箱还没有确认：请先点开确认邮件里的链接，然后再登录。",
      canLogin: false,
    };
  }
  if (/rate limit|too many requests|over_email_send_rate_limit/.test(text)) {
    return { text: "操作太频繁了，等几十秒再试一次。", canLogin: false };
  }
  if (/fetch failed|network|timeout|econnreset/.test(text)) {
    return {
      text: "网络连接失败：可能是浏览器无法访问 Supabase。",
      canLogin: false,
      hint: "检查系统代理是否开启，然后刷新页面重试。",
    };
  }
  return { text: message, canLogin: false };
}
