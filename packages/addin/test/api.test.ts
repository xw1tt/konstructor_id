import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { apiGet, apiSend, apiUpload, ServerUnavailableError } from "@idk/addin/api";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test("api: сетевая ошибка → ServerUnavailableError", async () => {
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  await assert.rejects(apiGet("/api/object"), ServerUnavailableError);
});

test("api: ответ 409 с error → Error с этим текстом", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Организация используется: представители (2)" }), { status: 409 });
  await assert.rejects(apiSend("DELETE", "/api/organizations/1"), (e: Error) => {
    assert.ok(!(e instanceof ServerUnavailableError));
    assert.equal(e.message, "Организация используется: представители (2)");
    return true;
  });
});

test("api: 204 → undefined, 200 → JSON", async () => {
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await apiSend("DELETE", "/api/materials/1"), undefined);
  globalThis.fetch = async () => new Response(JSON.stringify({ a: 1 }), { status: 200 });
  assert.deepEqual(await apiGet("/api/x"), { a: 1 });
});

test("api: upload передаёт X-File-Name в URI-кодировке", async () => {
  let seen: Headers | undefined;
  globalThis.fetch = async (_u, init) => {
    seen = new Headers(init?.headers);
    return new Response(JSON.stringify({ id: 1, pages: 1 }), { status: 201 });
  };
  await apiUpload(new Blob(["x"], { type: "application/pdf" }), "Паспорт №3/405.pdf");
  assert.equal(seen?.get("x-file-name"), encodeURIComponent("Паспорт №3/405.pdf"));
  assert.equal(seen?.get("content-type"), "application/pdf");
});
