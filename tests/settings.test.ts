import { afterEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/store/settingsStore";

describe("settingsStore reducedMotion", () => {
  afterEach(() => {
    useSettingsStore.setState({ reducedMotion: false });
  });

  it("默认关闭减少动画", () => {
    expect(useSettingsStore.getState().reducedMotion).toBe(false);
  });

  it("可以切换并持久化减少动画", () => {
    useSettingsStore.getState().setReducedMotion(true);
    expect(useSettingsStore.getState().reducedMotion).toBe(true);

    const partialize = useSettingsStore.persist.getOptions().partialize;
    expect(partialize?.(useSettingsStore.getState())).toMatchObject({ reducedMotion: true });
  });

  it("从 v3 迁移时保留旧设置并补齐 reducedMotion", async () => {
    const migrate = useSettingsStore.persist.getOptions().migrate;
    expect(migrate).toBeTypeOf("function");

    const migrated = await Promise.resolve(
      migrate?.(
        {
          llm: { mode: "real", model: "demo-model" },
          density: "detail",
          autoRotate: false,
          theme: "dark",
        },
        3,
      ),
    );

    expect(migrated).toMatchObject({
      density: "detail",
      autoRotate: false,
      theme: "dark",
      reducedMotion: false,
    });
    expect((migrated as { llm: { mode: string; model: string } }).llm).toMatchObject({
      mode: "real",
      model: "demo-model",
    });
  });

  it("持久化版本升级到 v4", () => {
    expect(useSettingsStore.persist.getOptions().version).toBe(4);
  });
});
