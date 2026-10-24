import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 数据库结构守卫：schema.sql 是手工维护的幂等脚本，
 * 这里用纯文本断言锁住 P1-A/P1-B 的关键语句，防止后续改动误删。
 */

const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const statements = schema
  .split(/^--\s*STATEMENT\s*$/m)
  .map((statement) => statement.trim())
  .filter(Boolean);

function findStatement(fragment: string): string {
  const found = statements.find((statement) =>
    statement.toLowerCase().includes(fragment.toLowerCase()),
  );
  expect(found, `schema.sql 缺少语句：${fragment}`).toBeTruthy();
  return found!;
}

describe("schema.sql · pgvector 与向量检索", () => {
  it("安装 pgvector 扩展并声明 1024 维列", () => {
    expect(schema).toContain("create extension if not exists vector");
    const col = findStatement("embedding vector(1024)");
    expect(col).toContain("alter table public.nodes add column if not exists");
  });

  it("包含模型隔离与回填所需的元数据列", () => {
    expect(schema).toContain("add column if not exists embedding_model text");
    expect(schema).toContain("add column if not exists embedding_updated_at timestamptz");
  });

  it("维度守卫会在旧库维度不符时直接报错", () => {
    const guard = findStatement("nodes.embedding 维度不匹配");
    expect(guard).toContain("raise exception");
  });

  it("建立 HNSW 余弦索引（只索引非空向量）", () => {
    const index = findStatement("nodes_embedding_hnsw_idx");
    expect(index).toContain("using hnsw");
    expect(index).toContain("vector_cosine_ops");
    expect(index).toContain("where embedding is not null");
  });

  it("match_nodes 只返回当前用户、当前模型的 top-k", () => {
    const fn = findStatement("create or replace function public.match_nodes");
    expect(fn).toContain("security invoker");
    expect(fn).toContain("auth.uid()");
    expect(fn).toContain("embedding_model = p_model");
    expect(fn).toContain("limit least(greatest(");
    expect(fn).toContain("order by n.embedding <=> query_embedding");
  });

  it("set_node_embedding 写入前受 RLS 约束", () => {
    const fn = findStatement("create or replace function public.set_node_embedding");
    expect(fn).toContain("user_id = auth.uid()");
    expect(fn).toContain("raise exception");
  });

  it("list_nodes_missing_embedding 用 distinct from 覆盖换模型场景", () => {
    const fn = findStatement("create or replace function public.list_nodes_missing_embedding");
    expect(fn).toContain("is distinct from p_model");
    expect(fn).toContain("limit 500");
  });

  it("三个 RPC 都对 anon / authenticated 授权", () => {
    for (const name of ["match_nodes", "set_node_embedding", "list_nodes_missing_embedding"]) {
      const grant = statements.find(
        (statement) =>
          statement.startsWith("grant execute") && statement.includes(`public.${name}`),
      );
      expect(grant, `缺少 ${name} 的 execute 授权`).toBeTruthy();
      expect(grant).toContain("anon, authenticated");
    }
  });
});

describe("schema.sql · events 埋点表", () => {
  it("events 表字段与索引齐备", () => {
    const table = findStatement("create table if not exists public.events");
    expect(table).toContain("props jsonb");
    expect(table).toContain("references auth.users(id) on delete cascade");
    expect(findStatement("create index if not exists events_user_created_idx")).toContain(
      "created_at desc",
    );
    expect(findStatement("create index if not exists events_name_created_idx")).toContain(
      "created_at desc",
    );
  });

  it("events 纳入表级授权与 RLS 批量策略", () => {
    const grant = findStatement("grant select, insert, update, delete");
    expect(grant).toContain("public.events");
    expect(schema).toContain("'chat_messages', 'events'");
  });
});

describe("schema.sql · 会话隔离", () => {
  it("conversations 表与 chat_messages.conversation_id 齐备", () => {
    const table = findStatement("create table if not exists public.conversations");
    expect(table).toContain("user_id uuid not null references auth.users");
    expect(table).toContain("updated_at timestamptz");
    expect(findStatement("add column if not exists conversation_id")).toContain(
      "references public.conversations",
    );
    expect(findStatement("chat_messages_conversation_idx")).toContain(
      "user_id, conversation_id, created_at",
    );
    expect(schema).toContain("历史对话");
  });

  it("conversations 纳入授权与 RLS，消息写入校验会话归属", () => {
    const grant = findStatement("grant select, insert, update, delete");
    expect(grant).toContain("public.conversations");
    expect(schema).toContain("'node_sources', 'conversations', 'chat_messages'");
    const insertPolicy = findStatement("chat_messages_owner_insert on public.chat_messages");
    expect(insertPolicy).toContain("conversation_id is null");
    expect(insertPolicy).toContain("public.conversations");
  });
});

describe("schema.sql · 幂等性", () => {
  it("建表语句都带 if not exists", () => {
    for (const statement of statements) {
      const normalized = statement.replace(/\s+/g, " ").toLowerCase();
      if (normalized.startsWith("create table")) {
        expect(normalized).toContain("if not exists");
      }
      if (normalized.startsWith("create index") || normalized.startsWith("create unique index")) {
        expect(normalized).toContain("if not exists");
      }
    }
  });

  it("函数与触发器使用可重复执行的写法", () => {
    for (const statement of statements) {
      const normalized = statement.replace(/\s+/g, " ").toLowerCase();
      if (normalized.startsWith("create function")) {
        throw new Error("函数必须使用 create or replace function");
      }
    }
    expect(schema).toContain("drop trigger if exists nodes_set_updated_at");
    expect(schema).toContain("drop trigger if exists on_auth_user_created");
  });

  it("语句数量不会因为拆分失误而异常缩水", () => {
    expect(statements.length).toBeGreaterThanOrEqual(30);
  });
});

describe("schema.sql · 与客户端常量一致", () => {
  it("EMBEDDING_DIM 必须与 vector 列维度一致", () => {
    const source = readFileSync(
      new URL("../src/lib/ai/embeddings.ts", import.meta.url),
      "utf8",
    );
    const match = source.match(/EMBEDDING_DIM\s*=\s*(\d+)/);
    expect(match, "src/lib/ai/embeddings.ts 缺少 EMBEDDING_DIM 常量").toBeTruthy();
    const dimension = Number(match![1]);
    expect(dimension).toBe(1024);
    expect(schema).toContain(`vector(${dimension})`);
  });
});
