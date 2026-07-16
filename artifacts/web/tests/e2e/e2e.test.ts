// End-to-end contract tests for the RAG features.
//
// These run against the LIVE FastAPI backend, reached THROUGH a real Vite dev
// server proxy (the same `/__rag` -> backend rewrite the browser uses), and they
// exercise the REAL frontend API client (src/lib/api.ts) so that any drift
// between what the backend emits and what the frontend reads fails loudly.
//
// Covered: chat SSE streaming (real tokens + the exact fallback string),
// semantic + keyword search, summary generation, and the comparison matrix.
// Every feature that returns citations is asserted to carry the fields the UI
// renders: document name, page, heading, quoted text, and confidence.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import { api, askStream } from "../../src/lib/api";
import type { AskRequest, Citation } from "../../src/lib/types";

// Must match backend FALLBACK_ANSWER (backend/app/config.py). Hardcoded on
// purpose: if the backend changes the fallback wording without the frontend
// knowing, this contract test should fail.
const FALLBACK = "I could not locate that information in the indexed documents.";

const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5817);
const WEB_DIR = process.env.E2E_WEB_DIR || path.resolve(process.cwd());
const BACKEND_URL = process.env.E2E_BACKEND_URL || "http://localhost:8000";

const ALPHA_TEXT = `# Master Services Agreement — Alpha Corp
## Payment Terms
Client shall pay all undisputed invoices within forty-five (45) days of receipt.
## Liability
Total liability of Vendor is capped at five million dollars ($5,000,000).
## Termination
Either party may terminate for convenience with thirty (30) days written notice.
`;

const BETA_TEXT = `# Master Services Agreement — Beta LLC
## Payment Terms
Client shall pay all undisputed invoices within sixty (60) days of receipt.
## Liability
Vendor liability under this agreement is unlimited and uncapped.
## Termination
Either party may terminate for convenience with ninety (90) days written notice.
`;

interface Ctx {
  alphaId: number;
  betaId: number;
  alphaName: string;
  betaName: string;
  conversationIds: number[];
  viteClose?: () => Promise<void>;
  backendProc?: ChildProcess;
}

const ctx: Ctx = {
  alphaId: 0,
  betaId: 0,
  alphaName: "",
  betaName: "",
  conversationIds: [],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(
  label: string,
  fn: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 750,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      if (await fn()) return;
    } catch (e) {
      lastErr = e;
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `Timed out waiting for ${label}` +
      (lastErr ? ` (last error: ${(lastErr as Error).message})` : ""),
  );
}

async function backendHealthy(): Promise<boolean> {
  const res = await fetch(`${BACKEND_URL}/api/health`);
  if (!res.ok) return false;
  const body = (await res.json()) as { status?: string };
  return body.status === "ok";
}

async function ensureBackend(): Promise<void> {
  try {
    if (await backendHealthy()) return;
  } catch {
    /* not up yet */
  }
  // Not reachable — start it ourselves and remember to tear it down.
  const backendDir = path.resolve(WEB_DIR, "..", "..", "backend");
  ctx.backendProc = spawn("python", ["run.py"], {
    cwd: backendDir,
    env: { ...process.env, PORT: "8000" },
    stdio: "ignore",
  });
  await waitFor("FastAPI backend /api/health", backendHealthy, 90_000, 1000);
}

async function startProxy(): Promise<void> {
  process.env.PORT = String(WEB_PORT);
  process.env.BASE_PATH = process.env.BASE_PATH || "/";
  process.env.RAG_BACKEND_URL = BACKEND_URL;
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: path.join(WEB_DIR, "vite.config.ts"),
    root: WEB_DIR,
    logLevel: "error",
    clearScreen: false,
  });
  await server.listen();
  ctx.viteClose = () => server.close();
  // Confirm the proxy actually reaches the backend before running tests.
  await waitFor(
    "Vite /__rag proxy -> backend",
    async () => {
      const res = await fetch(`http://localhost:${WEB_PORT}/__rag/api/health`);
      return res.ok;
    },
    20_000,
    500,
  );
}

async function uploadFixture(name: string, text: string): Promise<number> {
  const file = new File([text], name, { type: "text/plain" });
  const res = await api.uploadDocuments([file]);
  const item = res.results[0];
  if (!item?.document_id) {
    throw new Error(`Upload of ${name} did not return a document id`);
  }
  return item.document_id;
}

async function waitIndexed(id: number): Promise<void> {
  await waitFor(
    `document ${id} to finish indexing`,
    async () => {
      const doc = await api.getDocument(id);
      if (doc.status === "failed") {
        throw new Error(`document ${id} failed: ${doc.error_message ?? ""}`);
      }
      return doc.status === "indexed" && doc.chunk_count > 0;
    },
    90_000,
    1000,
  );
}

interface AskOutcome {
  tokens: string[];
  citations: Citation[];
  answer: string;
  conversationId?: number;
}

function runAsk(req: AskRequest): Promise<AskOutcome> {
  return new Promise((resolve, reject) => {
    const tokens: string[] = [];
    let citations: Citation[] = [];
    let conversationId: number | undefined;
    const timer = setTimeout(() => {
      abort();
      reject(new Error("askStream timed out"));
    }, 55_000);
    const abort = askStream(req, {
      onMeta: (id) => {
        conversationId = id;
      },
      onToken: (t) => tokens.push(t),
      onCitations: (c) => {
        citations = c;
      },
      onDone: (answer) => {
        clearTimeout(timer);
        resolve({ tokens, citations, answer, conversationId });
      },
      onError: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
  });
}

function assertCitationShape(c: Citation): void {
  assert.equal(typeof c.document_id, "number", "citation.document_id is a number");
  assert.equal(
    typeof c.document_name,
    "string",
    "citation.document_name is a string",
  );
  assert.ok(c.document_name.length > 0, "citation.document_name is non-empty");
  assert.equal(
    typeof c.quoted_text,
    "string",
    "citation.quoted_text is a string",
  );
  assert.ok(c.quoted_text.length > 0, "citation.quoted_text is non-empty");
  assert.ok(
    c.page_number === null || typeof c.page_number === "number",
    "citation.page_number is number|null",
  );
  assert.ok(
    c.heading === null || typeof c.heading === "string",
    "citation.heading is string|null",
  );
  assert.ok(
    c.confidence === null || typeof c.confidence === "number",
    "citation.confidence is number|null",
  );
}

before(async () => {
  await ensureBackend();
  await startProxy();
  const stamp = Date.now();
  ctx.alphaName = `__e2e_alpha_${stamp}.txt`;
  ctx.betaName = `__e2e_beta_${stamp}.txt`;
  ctx.alphaId = await uploadFixture(ctx.alphaName, ALPHA_TEXT);
  ctx.betaId = await uploadFixture(ctx.betaName, BETA_TEXT);
  await waitIndexed(ctx.alphaId);
  await waitIndexed(ctx.betaId);
}, { timeout: 180_000 });

after(async () => {
  for (const id of ctx.conversationIds) {
    try {
      await api.deleteConversation(id);
    } catch {
      /* best effort */
    }
  }
  for (const id of [ctx.alphaId, ctx.betaId]) {
    if (!id) continue;
    try {
      await api.deleteDocument(id);
    } catch {
      /* best effort */
    }
  }
  if (ctx.viteClose) {
    try {
      await ctx.viteClose();
    } catch {
      /* best effort */
    }
  }
  if (ctx.backendProc) ctx.backendProc.kill();
});

describe("health & proxy", () => {
  it(
    "reaches the live backend through the Vite proxy",
    { timeout: 20_000 },
    async () => {
      const health = await api.getHealth();
      assert.equal(health.status, "ok");
      assert.ok(health.vector_store.ok, "vector store reports ok");
    },
  );
});

describe("chat SSE streaming", () => {
  it(
    "streams real grounded tokens with citations",
    { timeout: 70_000 },
    async () => {
      const out = await runAsk({
        question: "What are the payment terms?",
        document_ids: [ctx.alphaId],
      });
      if (out.conversationId) ctx.conversationIds.push(out.conversationId);

      // Real tokens must arrive — this is the exact regression that the
      // `content` vs `token` field mismatch caused (empty stream, no error).
      assert.ok(out.tokens.length > 0, "received at least one streamed token");
      const joined = out.tokens.join("");
      assert.ok(joined.trim().length > 0, "streamed text is non-empty");
      assert.equal(
        joined.trim(),
        out.answer.trim(),
        "streamed tokens match the final answer",
      );
      assert.notEqual(out.answer.trim(), FALLBACK, "grounded answer is not the fallback");
      assert.match(
        out.answer,
        /45|forty-five/i,
        "answer reflects the document's 45-day payment term",
      );

      assert.ok(out.citations.length > 0, "grounded answer carries citations");
      for (const c of out.citations) assertCitationShape(c);
      assert.ok(
        out.citations.some((c) => c.document_name === ctx.alphaName),
        "a citation points at the source document",
      );
    },
  );

  it(
    "emits the exact fallback string when ungrounded",
    { timeout: 70_000 },
    async () => {
      const out = await runAsk({
        question:
          "What is the boiling point of liquid nitrogen on the planet Mars?",
        document_ids: [ctx.alphaId, ctx.betaId],
      });
      if (out.conversationId) ctx.conversationIds.push(out.conversationId);

      assert.equal(
        out.answer.trim(),
        FALLBACK,
        "ungrounded question returns the exact fallback sentence",
      );
      assert.equal(
        out.tokens.join("").trim(),
        FALLBACK,
        "fallback is delivered through the token stream too",
      );
      assert.equal(out.citations.length, 0, "fallback carries no citations");
    },
  );
});

describe("search", () => {
  it(
    "returns semantic results with citation fields",
    { timeout: 30_000 },
    async () => {
      const res = await api.search({
        query: "payment terms and invoices",
        mode: "semantic",
        document_ids: [ctx.alphaId, ctx.betaId],
      });
      assert.equal(res.mode, "semantic");
      assert.ok(res.results.length > 0, "semantic search returned results");
      for (const c of res.results) assertCitationShape(c);
      assert.ok(
        res.results.some((c) => typeof c.confidence === "number"),
        "semantic results expose a numeric confidence score",
      );
    },
  );

  it(
    "returns keyword results matching the query text",
    { timeout: 30_000 },
    async () => {
      const res = await api.search({
        query: "liability",
        mode: "keyword",
        document_ids: [ctx.alphaId, ctx.betaId],
      });
      assert.equal(res.mode, "keyword");
      assert.ok(res.results.length > 0, "keyword search returned results");
      for (const c of res.results) assertCitationShape(c);
      assert.ok(
        res.results.some((c) => /liability/i.test(c.quoted_text)),
        "keyword results contain the searched term",
      );
    },
  );
});

describe("summaries", () => {
  it(
    "generates a grounded summary with citations",
    { timeout: 70_000 },
    async () => {
      const res = await api.generateSummary({
        document_id: ctx.alphaId,
        style: "executive",
      });
      assert.equal(res.style, "executive");
      assert.ok(res.summary.trim().length > 0, "summary text is non-empty");
      assert.notEqual(
        res.summary.trim(),
        FALLBACK,
        "summary of a real document is not the fallback",
      );
      assert.ok(res.citations.length > 0, "summary carries citations");
      for (const c of res.citations) assertCitationShape(c);
    },
  );
});

describe("comparison matrix", () => {
  it(
    "builds a topic x document matrix that reflects real differences",
    { timeout: 90_000 },
    async () => {
      const topics = ["Payment terms", "Liability", "Termination clauses"];
      const res = await api.runComparison({
        document_ids: [ctx.alphaId, ctx.betaId],
        topics,
      });

      assert.equal(res.documents.length, 2, "two documents compared");
      assert.deepEqual(
        res.documents.map((d) => d.id).sort((a, b) => a - b),
        [ctx.alphaId, ctx.betaId].sort((a, b) => a - b),
      );
      for (const d of res.documents) {
        assert.ok(d.name.length > 0, "each compared document has a name");
      }
      assert.deepEqual(res.topics, topics);
      assert.equal(res.rows.length, topics.length, "one row per topic");

      const aKey = String(ctx.alphaId);
      const bKey = String(ctx.betaId);
      for (const row of res.rows) {
        assert.ok(topics.includes(row.topic), "row topic is one requested");
        assert.equal(
          typeof row.values[aKey],
          "string",
          "matrix cell for alpha is a string",
        );
        assert.equal(
          typeof row.values[bKey],
          "string",
          "matrix cell for beta is a string",
        );
        assert.ok(row.values[aKey].length > 0, "alpha cell is non-empty");
        assert.ok(row.values[bKey].length > 0, "beta cell is non-empty");
      }

      // The two contracts differ on payment terms (45 vs 60 days), so the
      // matrix must surface a real difference rather than identical cells.
      const payment = res.rows.find((r) => r.topic === "Payment terms");
      assert.ok(payment, "payment terms row exists");
      assert.notEqual(payment!.values[aKey], FALLBACK, "alpha payment cell grounded");
      assert.notEqual(payment!.values[bKey], FALLBACK, "beta payment cell grounded");
      assert.notEqual(
        payment!.values[aKey],
        payment!.values[bKey],
        "payment terms differ between the two documents",
      );
    },
  );
});
