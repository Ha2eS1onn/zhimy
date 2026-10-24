"use client";

import { useState } from "react";
import { Icon } from "../shell/Icon";
import { MarkdownLite } from "./MarkdownLite";

interface DetailEditorProps {
  value: string;
  saving: boolean;
  generating: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onGenerate: () => void;
}

/** 正文编辑器：编辑 / 预览双模式，Ctrl+S 保存。 */
export function DetailEditor({
  value,
  saving,
  generating,
  onChange,
  onSave,
  onCancel,
  onGenerate,
}: DetailEditorProps) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div
          className="segmented"
          data-count={2}
          data-index={mode === "edit" ? 0 : 1}
        >
          <button type="button" data-active={mode === "edit"} onClick={() => setMode("edit")}>
            编辑
          </button>
          <button type="button" data-active={mode === "preview"} onClick={() => setMode("preview")}>
            预览
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={onGenerate} disabled={generating}>
            <Icon name="spark" size={13} />
            {generating ? "生成中…" : "AI 重写"}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel} disabled={saving}>
            取消
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={onSave} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>

      {mode === "edit" ? (
        <div key="edit" className="motion-fade p-3">
          <textarea
            className="textarea min-h-[420px] font-mono text-[13px] leading-6"
            value={value}
            placeholder={
              "用 Markdown 写讲解，例如：\n\n## 一句话理解\n…\n\n## 核心概念\n- 要点一\n- 要点二\n\n公式：行内 $R_x$，独立一行 $$\\sqrt{R_A \\cdot R_V}$$\n\n支持 ## 标题、- 列表、**加粗**、`代码`、> 引用。"
            }
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                onSave();
              }
            }}
          />
          <p className="mt-2 text-[11px] text-muted">
            Ctrl / Cmd + S 保存 · {value.length} 字
          </p>
        </div>
      ) : (
        <div key="preview" className="motion-fade min-h-[420px] p-4">
          {value.trim() ? (
            <MarkdownLite markdown={value} />
          ) : (
            <p className="text-xs text-muted">暂无内容。</p>
          )}
        </div>
      )}
    </div>
  );
}
