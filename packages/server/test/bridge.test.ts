// 0.36: связь окна с книгой в Excel через панель (сервер только пересылает вызовы и события).
import { test } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, type TestServer } from "./helpers/server.ts";

/** Читатель потока SSE: next() — следующее сообщение data: (JSON). */
async function stream(s: TestServer, path: string) {
  const ac = new AbortController();
  const res = await s.raw("GET", path, { signal: ac.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /event-stream/);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const queue: any[] = [];
  const next = async (): Promise<any> => {
    for (;;) {
      if (queue.length) return queue.shift();
      const { value, done } = await reader.read();
      if (done) throw new Error("поток закрыт");
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (line) queue.push(JSON.parse(line.slice(6)));
      }
    }
  };
  /** Пропускает сообщения, пока не придёт подходящее. */
  const until = async (pred: (m: any) => boolean) => {
    for (;;) {
      const m = await next();
      if (pred(m)) return m;
    }
  };
  return { next, until, close: () => ac.abort() };
}

test("вызов окна доходит до панели книги и возвращается ответом", async () => {
  const s = await startTestServer({ openWindow: null });
  assert.equal((await s.req("POST", "/api/book/call", { method: "read", args: ["Акты"] })).status, 409);

  const panel = await stream(s, "/api/book/link?panel=p1&book=" + encodeURIComponent("Объект.xlsx"));
  assert.deepEqual(await panel.next(), { type: "windows", count: 0, active: true });
  assert.deepEqual((await s.req("GET", "/api/book/status")).json, { books: [{ panel: "p1", name: "Объект.xlsx" }], active: "p1" });

  const call = s.req("POST", "/api/book/call", { method: "read", args: ["Акты"] });
  const m = await panel.until((x) => x.type === "call");
  assert.equal(m.method, "read");
  assert.deepEqual(m.args, ["Акты"]);
  assert.equal((await s.req("POST", "/api/book/result", { id: m.id, ok: true, value: { rows: [[1]] } })).status, 204);
  assert.deepEqual(await call, { status: 200, json: { value: { rows: [[1]] } } });

  // Ошибка Excel → 502 с текстом панели.
  const bad = s.req("POST", "/api/book/call", { method: "write", args: ["Акты", 0, {}] });
  const m2 = await panel.until((x) => x.type === "call");
  await s.req("POST", "/api/book/result", { id: m2.id, ok: false, error: "Лист защищён" });
  assert.deepEqual(await bad, { status: 502, json: { error: "Лист защищён" } });

  // Неизвестный метод не пересылается.
  assert.equal((await s.req("POST", "/api/book/call", { method: "eval", args: [] })).status, 400);
  panel.close();
});

test("события активной книги — окну; закрытая панель отвечает ошибкой на ждущий вызов", async () => {
  const s = await startTestServer({ openWindow: null });
  const a = await stream(s, "/api/book/link?panel=a&book=A");
  await a.next();
  const b = await stream(s, "/api/book/link?panel=b&book=B");
  await b.next();
  const win = await stream(s, "/api/book/events");
  const st = await win.until((x) => x.type === "status");
  assert.equal(st.status.active, "b", "по умолчанию — последняя открытая книга");
  assert.equal(st.status.books.length, 2);
  // Панель узнаёт, что окно открыто.
  assert.deepEqual(await b.until((x) => x.type === "windows" && x.count === 1), { type: "windows", count: 1, active: true });

  // Окно выбирает книгу A.
  assert.equal((await s.req("POST", "/api/book/active", { panel: "a" })).json.active, "a");
  await win.until((x) => x.type === "status" && x.status.active === "a");
  // События неактивной книги не пересылаются.
  await s.req("POST", "/api/book/event", { panel: "b", kind: "selection" });
  await s.req("POST", "/api/book/event", { panel: "a", kind: "change", payload: { table: "Акты" } });
  assert.deepEqual(await win.until((x) => x.type !== "status"), { type: "change", payload: { table: "Акты" } });

  const call = s.req("POST", "/api/book/call", { method: "getSelection", args: [] });
  await a.until((x) => x.type === "call");
  a.close();
  const r = await call;
  assert.equal(r.status, 502);
  assert.match(r.json.error, /Книга закрыта/);
  const after = await win.until((x) => x.type === "status" && x.status.books.length === 1);
  assert.equal(after.status.active, "b");
  b.close();
  win.close();
});

test("панель не ответила — вызов завершается по времени", async () => {
  const s = await startTestServer({ openWindow: null, bridgeTimeoutMs: 50 });
  const p = await stream(s, "/api/book/link?panel=p&book=X");
  await p.next();
  const r = await s.req("POST", "/api/book/call", { method: "getSelection" });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /не ответил/);
  p.close();
});

test("«Открыть в окне»: книга панели становится активной, окно запускается с экраном", async () => {
  const opened: (string | undefined)[] = [];
  const s = await startTestServer({ openWindow: async (screen) => void opened.push(screen) });
  const a = await stream(s, "/api/book/link?panel=a&book=A");
  await a.next();
  const b = await stream(s, "/api/book/link?panel=b&book=B");
  await b.next();
  assert.equal((await s.req("POST", "/api/window/open", { panel: "a", screen: "assistant" })).status, 204);
  assert.deepEqual(opened, ["assistant"]);
  assert.equal((await s.req("GET", "/api/book/status")).json.active, "a");
  assert.equal((await s.req("POST", "/api/window/open", { screen: "wizard" })).status, 400);
  a.close();
  b.close();

  const none = await startTestServer({ openWindow: null });
  const r = await none.req("POST", "/api/window/open", {});
  assert.equal(r.status, 501);
  assert.match(r.json.error, /Windows/);
});
