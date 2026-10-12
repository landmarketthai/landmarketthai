import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("seller upload endpoints fail closed before touching Neon or storage", () => {
  const presign = read("../app/api/property-submissions/[id]/uploads/presign/route.ts");
  const confirm = read("../app/api/property-submissions/[id]/uploads/confirm/route.ts");
  for (const source of [presign, confirm]) {
    const gate = source.indexOf("if (!sellerUploadsEnabled)");
    const rateLimit = source.indexOf("await guardPublicWrite");
    assert.ok(gate > -1, "explicit feature gate");
    assert.ok(rateLimit > gate, "feature disabled before any rate-limit/database call");
    assert.match(source, /status: 503/);
    assert.match(source, /Cache-Control.*no-store/);
    assert.match(source, /ปิดชั่วคราว/);
  }
  const flag = read("./marketplace/seller-upload-gate.ts");
  assert.match(flag, /process\.env\.NEXT_PUBLIC_SELL_UPLOAD_ENABLED === "true"/, "off unless explicitly enabled");
});

test("seller form explains no-upload and hides file pickers", () => {
  const source = read("../components/forms/SellWizard.tsx");
  assert.match(source, /sellerUploadsEnabled\s*&&\s*\(/);
  assert.match(source, /!sellerUploadsEnabled\s*&&/);
  assert.match(source, /ทีมงานจะติดต่อกลับเพื่อขอรูปและเอกสาร/);
});

test("seller draft submission remains independent of images and documents", () => {
  const source = read("./marketplace/submission-readiness.ts");
  assert.doesNotMatch(source, /draft\.media|draft\.images|missing\.push\(["']รูป/);
});
