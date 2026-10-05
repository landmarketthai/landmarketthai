import test from "node:test";
import assert from "node:assert/strict";
import { areaFromText } from "./area-text.ts";

const index = {
  p: { "ระยอง": "21", "กรุงเทพมหานคร": "10", "กรุงเทพ": "10", "สุโขทัย": "64" },
  d: { "นิคมพัฒนา": ["21"], "บางพลัด": ["10"], "เฉลิมพระเกียรติ": ["64", "21"] },
};

test("free search text resolves to a province and district boundary", () => {
  assert.deepEqual(areaFromText("ระยอง", index), { code: "21" });
  assert.deepEqual(areaFromText("จ.ระยอง", index), { code: "21" });
  assert.deepEqual(areaFromText("อ.นิคมพัฒนา จ.ระยอง", index), { code: "21", district: "นิคมพัฒนา" });
  assert.deepEqual(areaFromText("บางพลัด", index), { code: "10", district: "บางพลัด" });
  assert.deepEqual(areaFromText("เขตบางพลัด กรุงเทพ", index), { code: "10", district: "บางพลัด" });
  // Shared district names need their province.
  assert.equal(areaFromText("เฉลิมพระเกียรติ", index), null);
  assert.deepEqual(areaFromText("เฉลิมพระเกียรติ ระยอง", index), { code: "21", district: "เฉลิมพระเกียรติ" });
  assert.equal(areaFromText("นิคมอมตะ", index), null);
  assert.equal(areaFromText(undefined, index), null);
});
