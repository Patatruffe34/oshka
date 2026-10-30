/** Verify real hosting responses, including the headers Safari needs. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const origin = process.argv[2] || "http://127.0.0.1:5002";
const response = await fetch(new URL("/shortcuts/Ajouter-a-Oshka.shortcut?download=1", origin));
assert.equal(response.status, 200);
assert.match(response.headers.get("content-disposition") || "", /^attachment;.*filename="Ajouter-a-Oshka\.shortcut"/);
assert.equal(response.headers.get("content-type"), "application/octet-stream");
assert.match(response.headers.get("cache-control") || "", /no-store/);
const expected = await readFile(new URL("../public/shortcuts/Ajouter-a-Oshka.shortcut", import.meta.url));
assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
console.log("Shortcut: HTTP 200, forced download, .shortcut filename, no cache, signed file intact.");
