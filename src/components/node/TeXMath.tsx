import katex from "katex";

/**
 * 公式渲染：交给 KaTeX（支持 \overrightarrow、\left|...\right|、矩阵、cases、
 * aligned 等复杂写法），不再维护自研的 LaTeX 子集解析器。
 *
 * 安全与稳定性：
 * - trust:false 禁用 \href / \htmlClass 等可执行/可注入命令；
 * - throwOnError:false 让未知命令以错误高亮呈现，保留公式其余部分；
 * - maxExpand/maxSize 限制宏展开与尺寸，避免异常输入拖垮渲染。
 */

const KATEX_OPTIONS = {
  throwOnError: false,
  strict: "ignore",
  trust: false,
  output: "htmlAndMathml",
  maxExpand: 1000,
  maxSize: 20,
  errorColor: "#f87171",
} as const;

function renderKatex(tex: string, display: boolean): string | null {
  try {
    return katex.renderToString(tex, {
      ...KATEX_OPTIONS,
      displayMode: display,
    });
  } catch {
    return null;
  }
}

function FormulaFallback({ tex, display }: { tex: string; display: boolean }) {
  return (
    <code
      className={
        display
          ? "block overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-surface-2 px-2 py-1 text-left font-mono text-[0.85em] text-muted"
          : "inline-block max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em] text-muted"
      }
      title="公式解析失败，已显示源码"
    >
      {tex}
    </code>
  );
}

export function TeXMath({ tex, display = false }: { tex: string; display?: boolean }) {
  const source = (tex ?? "").trim();
  if (!source) return null;

  const html = renderKatex(source, display);
  if (!html) return <FormulaFallback tex={source} display={display} />;

  if (display) {
    return (
      <span className="zhimy-math-display">
        <span className="zhimy-math" dangerouslySetInnerHTML={{ __html: html }} />
      </span>
    );
  }

  return (
    <span
      className="zhimy-math zhimy-math-inline"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
