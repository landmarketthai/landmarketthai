import test from "node:test";
import assert from "node:assert/strict";
import { generatePresignedUpload } from "./storage/provider.ts";

// Signing is offline; the .invalid endpoint guarantees no request can reach a real bucket.
Object.assign(process.env, {
  DO_SPACES_ENDPOINT: "https://sgp1.storage.invalid",
  DO_SPACES_BUCKET: "uat-fake-bucket",
  DO_SPACES_KEY: "fake-key",
  DO_SPACES_SECRET: "fake-secret",
});

test("storage key extension comes from the MIME type, never the client file name", async () => {
  const folder = "submissions/11111111-1111-4111-8111-111111111111/images" as const;
  for (const [originalName, mimeType, ext] of [
    ["a./../../x", "image/png", "png"],
    ["evil.html", "image/jpeg", "jpg"],
    ["noext", "image/webp", "webp"],
    ["deed.PDF/..", "application/pdf", "pdf"],
  ]) {
    const { storageKey, uploadUrl } = await generatePresignedUpload({ folder, mimeType, fileSize: 1024, originalName });
    assert.match(storageKey, new RegExp(`^${folder}/[0-9a-f-]{36}\.${ext}$`));
    assert.ok(new URL(uploadUrl).hostname.endsWith(".invalid"));
  }
  await assert.rejects(generatePresignedUpload({ folder, mimeType: "text/html", fileSize: 1, originalName: "x.html" }), /not allowed/);
});
