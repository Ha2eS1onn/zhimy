"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocalThumbnail } from "@/components/common/LocalThumbnail";
import { PositionPicker } from "@/components/common/PositionPicker";
import { Icon } from "@/components/shell/Icon";
import { RelationEditor } from "@/components/atlas/RelationEditor";
import { RelationList } from "@/components/atlas/RelationList";
import { EVENTS, track } from "@/lib/analytics";
import { formatDateTime } from "@/lib/format";
import { buildPath } from "@/lib/path";
import { relationsOf } from "@/lib/relations";
import { buildTemplateDetail, generateDetailWithLlm } from "@/lib/ai/detail";
import { useChatStore } from "@/store/chatStore";
import { useGraphStore } from "@/store/graphStore";
import { useSettingsStore } from "@/store/settingsStore";
import { toast } from "@/store/toastStore";
import { DetailEditor } from "./DetailEditor";
import { MarkdownLite } from "./MarkdownLite";

/** /node/[id]：知识点的完整讲解页（查看 / 编辑 / AI 生成 / 关系与来源）。 */
export function NodeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const rawId = params?.id;
  const nodeId = Array.isArray(rawId) ? (rawId[0] ?? "") : (rawId ?? "");

  const nodes = useGraphStore((state) => state.nodes);
  const relations = useGraphStore((state) => state.relations);
  const sources = useGraphStore((state) => state.sources);
  const nodeSources = useGraphStore((state) => state.nodeSources);
  const loading = useGraphStore((state) => state.loading);
  const updateDetails = useGraphStore((state) => state.updateDetails);
  const reparent = useGraphStore((state) => state.reparent);
  const setStatus = useGraphStore((state) => state.setStatus);
  const clearManualPosition = useGraphStore((state) => state.clearManualPosition);
  const createPath = useGraphStore((state) => state.createPath);
  const messages = useChatStore((state) => state.messages);
  const llm = useSettingsStore((state) => state.llm);

  const node = nodes.find((item) => item.id === nodeId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [relationEditorOpen, setRelationEditorOpen] = useState(false);

  const openedNodeRef = useRef<string | null>(null);

  // 进入详情页记一次 node_opened：按 nodeId 去重，StrictMode 双执行 / 重复渲染都不重复上报。
  useEffect(() => {
    if (!nodeId || openedNodeRef.current === nodeId) return;
    openedNodeRef.current = nodeId;
    track(EVENTS.nodeOpened, { from: "detail" });
  }, [nodeId]);

  const path = useMemo(() => (node ? buildPath(nodes, node.id) : []), [nodes, node]);
  const pathText = path.map((item) => item.title).join(" / ");
  const children = node ? nodes.filter((item) => item.parentId === node.id) : [];
  const related = node ? relationsOf(relations, node.id) : [];
  const relatedDetails = related.flatMap((relation) => {
    const otherId = relation.fromId === node?.id ? relation.toId : relation.fromId;
    const other = nodes.find((item) => item.id === otherId);
    return other ? [{ relation, node: other }] : [];
  });
  const ownSourceIds = new Set(
    nodeSources.filter((link) => link.nodeId === nodeId).map((link) => link.sourceId),
  );
  const nodeSourceList = sources
    .filter((source) => ownSourceIds.has(source.id))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const hitCount = messages.filter((message) => message.payload.hit?.nodeId === nodeId).length;

  if (!node) {
    return (
      <div className="page-scroll">
        <div className="page-wrap max-w-3xl">
          <div className="card p-6 text-center">
            {loading ? (
              <p className="text-sm text-muted">正在从云端加载知识点…</p>
            ) : (
              <>
                <p className="text-sm font-medium text-ink">没有找到这个知识点</p>
                <p className="mt-1 text-xs text-muted">它可能已被删除，或者链接不完整。</p>
                <Link href="/atlas" className="btn-primary btn-sm mt-4">
                  返回知识库
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const startEditing = () => {
    setDraft(node.detail);
    setEditing(true);
  };

  const saveDetail = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateDetails(node.id, { detail: draft });
      setEditing(false);
      toast("讲解已保存到云端", "success");
      track(EVENTS.detailSaved);
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    if (generating) return;
    // 演示/模板模式统一记为 template；真实模型记为 llm.mode（real）。
    const generateMode = llm.mode === "real" ? "real" : "template";
    setGenerating(true);
    try {
      if (llm.mode !== "real") {
        const template = buildTemplateDetail({
          node,
          path: pathText,
          relations: relatedDetails.map(({ relation, node: other }) => ({
            type: relation.type,
            targetTitle: other.title,
          })),
          childTitles: children.map((child) => child.title),
          sources: nodeSourceList.map((source) => ({
            question: source.question,
            answer: source.answer,
          })),
        });
        setDraft(template);
        setEditing(true);
        toast("已用演示模板生成讲解，可以直接修改后保存", "info");
        track(EVENTS.detailGenerated, { mode: "template", ok: true });
        return;
      }

      const text = await generateDetailWithLlm({
        settings: llm,
        detailInput: {
          node,
          path: pathText,
          relations: relatedDetails.map(({ relation, node: other }) => ({
            type: relation.type,
            targetTitle: other.title,
          })),
          childTitles: children.map((child) => child.title),
          sources: nodeSourceList.map((source) => ({
            question: source.question,
            answer: source.answer,
          })),
        },
      });
      setDraft(text);
      setEditing(true);
      toast("AI 已生成讲解，检查后保存", "success");
      track(EVENTS.detailGenerated, { mode: "real", ok: true });
    } catch (error) {
      track(EVENTS.detailGenerated, { mode: generateMode, ok: false });
      toast(error instanceof Error ? error.message : "生成失败", "error");
    } finally {
      setGenerating(false);
    }
  };

  const startProfileEditing = () => {
    setTitleDraft(node.title);
    setSummaryDraft(node.summary);
    setProfileEditing(true);
  };

  const saveProfile = async () => {
    try {
      await updateDetails(node.id, { title: titleDraft, summary: summaryDraft });
      setProfileEditing(false);
      toast("标题与摘要已更新", "success");
      track(EVENTS.profileSaved);
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败", "error");
    }
  };

  const handleReparent = async (parentId: string | null) => {
    try {
      await reparent(node.id, parentId);
      if (node.status === "inbox") await setStatus(node.id, "active");
      toast(parentId ? "已调整到新位置" : "已移到顶层", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "调整位置失败", "error");
    }
  };

  return (
    <div className="page-scroll">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/atlas?node=${node.id}`} className="btn-ghost btn-sm">
            <Icon name="arrow-right" size={14} className="rotate-180" /> 返回知识库
          </Link>
          <div className="flex flex-wrap gap-1.5">
            <span className={`chip ${node.status === "inbox" ? "border-warn/40 text-warn" : ""}`}>
              {node.status === "inbox" ? "待归位" : "已收编"}
            </span>
            <span className="chip">关系 {related.length}</span>
            <span className="chip">子节点 {children.length}</span>
            <span className="chip">命中 {hitCount}</span>
            {node.manualPosition ? <span className="chip">手动定位</span> : null}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <header className="card p-4 md:p-5">
              <p className="text-[11px] text-muted">
                {path.map((item, index) => (
                  <span key={item.id}>
                    {index > 0 ? " / " : ""}
                    <Link href={`/atlas?node=${item.id}`} className="hover:text-ink">
                      {item.title}
                    </Link>
                  </span>
                ))}
              </p>

              {profileEditing ? (
                <div className="mt-2 space-y-2">
                  <input
                    className="input text-base font-semibold"
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    placeholder="知识点名称"
                  />
                  <textarea
                    className="textarea"
                    rows={2}
                    value={summaryDraft}
                    onChange={(event) => setSummaryDraft(event.target.value)}
                    placeholder="一句话摘要"
                  />
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary btn-sm" onClick={() => void saveProfile()}>
                      保存
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setProfileEditing(false)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{node.title}</h1>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {node.summary || "还没有摘要。"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn-ghost btn-sm" onClick={startProfileEditing}>
                      <Icon name="settings" size={13} /> 编辑名称/摘要
                    </button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setPickerOpen(true)}>
                      调整位置
                    </button>
                    {node.manualPosition ? (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => {
                          void clearManualPosition(node.id)
                            .then(() => toast("已恢复自动布局位置", "success"))
                            .catch((error) =>
                              toast(error instanceof Error ? error.message : "恢复失败", "error"),
                            );
                        }}
                      >
                        恢复自动位置
                      </button>
                    ) : null}
                    <Link
                      href={`/chat?q=${encodeURIComponent(node.title)}`}
                      className="btn-ghost btn-sm"
                    >
                      <Icon name="chat" size={13} /> 在对话中复习
                    </Link>
                  </div>
                </>
              )}
            </header>

            {editing ? (
              <DetailEditor
                value={draft}
                saving={saving}
                generating={generating}
                onChange={setDraft}
                onSave={() => void saveDetail()}
                onCancel={() => {
                  if (draft !== node.detail && !window.confirm("放弃未保存的修改？")) return;
                  setEditing(false);
                }}
                onGenerate={() => void generate()}
              />
            ) : (
              <section className="card p-4 md:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">完整讲解</h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={startEditing}
                      disabled={generating}
                    >
                      <Icon name="settings" size={13} /> 编辑正文
                    </button>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => void generate()}
                      disabled={generating}
                    >
                      <Icon name="spark" size={13} />
                      {generating ? "生成中…" : node.detail ? "AI 重写" : "AI 生成讲解"}
                    </button>
                  </div>
                </div>
                {node.detail.trim() ? (
                  <MarkdownLite markdown={node.detail} />
                ) : (
                  <div className="rounded-xl border border-dashed border-line bg-surface/50 px-4 py-10 text-center">
                    <p className="text-sm text-ink">还没有完整讲解</p>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
                      可以让 AI 根据来源对话和关联知识点生成一份，也可以自己写。
                      {llm.mode === "real"
                        ? ""
                        : " 当前是演示模式，会使用模板生成，接入自己的模型后质量更高。"}
                    </p>
                    <div className="mt-4 flex justify-center gap-2">
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        onClick={() => void generate()}
                        disabled={generating}
                      >
                        {generating ? "生成中…" : "AI 生成讲解"}
                      </button>
                      <button type="button" className="btn-ghost btn-sm" onClick={startEditing}>
                        手动写
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <section className="card p-4">
              <h2 className="text-sm font-semibold text-ink">来源对话（{nodeSourceList.length}）</h2>
              {nodeSourceList.length === 0 ? (
                <p className="mt-2 text-xs text-muted">
                  没有来源记录。从对话收编的知识点会自动记录原题与解答。
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {nodeSourceList.map((source) => (
                    <li key={source.id} className="rounded-lg border border-line bg-surface px-2.5 py-2">
                      {source.kind === "image" ? (
                        <LocalThumbnail
                          id={source.id}
                          alt="题目图片"
                          className="mb-1.5 h-20 w-20 rounded-lg border border-line object-cover"
                        />
                      ) : null}
                      <p className="line-clamp-2 text-xs text-ink">{source.question || "（图片提问）"}</p>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {formatDateTime(source.createdAt)} · {source.answer.length} 字解答
                      </p>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-accent">查看完整解答</summary>
                        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">
                          {source.answer}
                        </p>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">关系（{related.length}）</h2>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setRelationEditorOpen(true)}
                >
                  <Icon name="plus" size={12} /> 添加
                </button>
              </div>
              <RelationList
                nodeId={node.id}
                nodes={nodes}
                relations={relations}
                onSelect={(id) => router.push(`/node/${id}`)}
                editable
              />
            </section>

            <section className="card p-4">
              <h2 className="text-sm font-semibold text-ink">子知识点（{children.length}）</h2>
              {children.length === 0 ? (
                <p className="mt-2 text-xs text-muted">这是叶子节点。</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {children.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={`/node/${child.id}`}
                        className="block truncate rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink hover:border-accent/40"
                      >
                        {child.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card p-4 text-[11px] text-muted">
              <h2 className="text-sm font-semibold text-ink">信息</h2>
              <dl className="mt-2 space-y-1">
                <div className="flex justify-between gap-2">
                  <dt>收编时间</dt>
                  <dd className="text-ink">{formatDateTime(node.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>最近更新</dt>
                  <dd className="text-ink">{formatDateTime(node.updatedAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>别名</dt>
                  <dd className="text-right text-ink">{node.aliases.join("、") || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>位置</dt>
                  <dd className="text-right text-ink">
                    {node.manualPosition ? "手动定位" : "自动布局"}
                  </dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>
      </div>

      <PositionPicker
        open={pickerOpen}
        nodes={nodes}
        currentParentId={node.parentId}
        excludeId={node.id}
        onCreatePath={(segments, options) =>
          createPath(segments, options).then((result) => result.leafId)
        }
        onClose={() => setPickerOpen(false)}
        onSelect={(parentId) => void handleReparent(parentId)}
      />
      <RelationEditor
        open={relationEditorOpen}
        fromId={node.id}
        nodes={nodes}
        relations={relations}
        onClose={() => setRelationEditorOpen(false)}
      />
    </div>
  );
}
