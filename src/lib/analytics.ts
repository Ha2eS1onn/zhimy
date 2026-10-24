/**
 * 指标埋点入口（P1-B）。
 *
 * track 的约束：同步返回、绝不抛错，埋点失败不影响任何主流程。
 * - 无登录用户（未就绪 / 已退出）时丢弃；
 * - 演示模式或内存仓库只在非生产环境 console.debug，不写库；
 * - 其余情况异步写入 Supabase events 表（RLS 只允许本人读写）。
 *
 * 事件名与属性清洗在 ./analyticsCore.ts，方便纯函数单测。
 */
import { isDemoMode } from "@/lib/env";
import { newId, nowIso } from "@/lib/ids";
import { getRepo } from "@/lib/repo";
import { useSessionStore } from "@/store/sessionStore";
import type { AppEvent } from "@/types";
import { sanitizeProps } from "./analyticsCore";
import type { AnalyticsEventName } from "./analyticsCore";

export {
  EVENTS,
  MAX_PROP_KEYS,
  MAX_PROP_STRING_LENGTH,
  sanitizeProps,
} from "./analyticsCore";
export type { AnalyticsEventName } from "./analyticsCore";

/** 记录一个埋点事件；fire-and-forget，同步返回，永不抛错。 */
export function track(name: AnalyticsEventName | string, props?: Record<string, unknown>): void {
  void (async () => {
    try {
      const user = useSessionStore.getState().user;
      if (!user) return;

      const cleanedProps = sanitizeProps(props);
      const repo = getRepo();

      // 演示模式 / 内存仓库没有可写的后端：开发时打日志方便核对埋点。
      if (isDemoMode() || repo.kind === "memory") {
        if (process.env.NODE_ENV !== "production") {
          console.debug(`[analytics] ${name}`, cleanedProps);
        }
        return;
      }

      const event: AppEvent = {
        id: newId(),
        name,
        props: cleanedProps,
        createdAt: nowIso(),
      };
      await repo.insertEvent(user.id, event);
    } catch {
      // 静默失败：埋点只是观测手段，任何情况下都不该影响用户操作。
    }
  })();
}
