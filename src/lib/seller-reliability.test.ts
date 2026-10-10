import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { draftPatch, loadSellerDraft, mergeDraft } from "./seller-draft.ts";
import { coordinatesFromMapsUrl, resolveMapsInput, MAPS_LINK_ERRORS } from "./google-maps-link.ts";
import type { PropertySubmission } from "./types/database.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const wizard = read("../components/forms/SellWizard.tsx");
// Run the actual component's async handlers with controlled browser/network state, without React or a DOM dependency.
function handler(name: string, env: Record<string, unknown>) {
  const start = wizard.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const indent = wizard.slice(wizard.lastIndexOf("\n", start) + 1, start).match(/^ */)![0];
  const end = wizard.indexOf(`\n${indent}}\n`, start) + indent.length + 3;
  const code = stripTypeScriptTypes((wizard.slice(start - 6, start) === "async " ? "async " : "") + wizard.slice(start, end));
  return new Function(...Object.keys(env), `${code}; return ${name};`)(...Object.values(env));
}
const response = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const submission = { id: "draft-a", status: "draft", contact_phone: "0812345678", media: [{ id: "image-a", file_name: "a.jpg" }] } as PropertySubmission;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

test("submission locks the eligible draft before creating its owner lead", () => {
  const marketplace = read("./neon/marketplace.ts");
  const submit = marketplace.slice(marketplace.indexOf("export async function submitPropertyDraft("), marketplace.indexOf("export async function propertyDraftExists("));
  assert.match(submit, /with target as \([\s\S]*?status = 'draft'[\s\S]*?for update\s*\), new_lead as/);
  assert.match(submit, /insert into leads[\s\S]*?from target/);
});

test("restore returns missing only for 404/null; transient and malformed responses remain retryable", async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    await assert.rejects(loadSellerDraft("draft-a", "token", async () => response(status)));
  }
  await assert.rejects(loadSellerDraft("draft-a", "token", async () => { throw new Error("offline"); }));
  await assert.rejects(loadSellerDraft("draft-a", "token", async () => response(200, {})));
  assert.equal(await loadSellerDraft("draft-a", "token", async () => response(404)), null);
  assert.equal(await loadSellerDraft("draft-a", "token", async () => response(200, { draft: null })), null);
  for (const status of ["draft", "pending_review", "approved", "published", "rejected", "sold", "expired"]) {
    assert.equal((await loadSellerDraft("draft-a", "token", async () => response(200, { draft: { ...submission, status } })))?.status, status);
  }
});

test("partial phones are omitted, explicit clearing is retained, and PATCH preserves omitted media", () => {
  const local = { contact_phone: "0812", title: "edited" };
  assert.deepEqual(JSON.parse(draftPatch(local, null)), { title: "edited", price_per_rai: null });
  assert.equal(local.contact_phone, "0812");
  assert.equal(JSON.parse(draftPatch({ contact_phone: "" }, null)).contact_phone, "");
  assert.equal(JSON.parse(draftPatch({ contact_phone: "+66 81 234 5678" }, null)).contact_phone, "+66 81 234 5678");
  assert.deepEqual(mergeDraft(submission, { ...submission, media: undefined }).media, submission.media);
  assert.deepEqual(mergeDraft(submission, { ...submission, media: [] }).media, []);
  assert.match(read("./neon/marketplace.ts"), /contact_phone = case when \$29::boolean then \$26 else contact_phone end/);
  assert.match(read("./neon/marketplace.ts"), /input\.contact_phone !== undefined/);
});

test("initialization preserves credentials on failed restore, restores local values, and locks stale submissions", async () => {
  const stored = new Map([["credentials", JSON.stringify({ id: "draft-a", token: "original-token" })], ["local:draft-a", JSON.stringify({ contact_phone: "0812", title: "local edit" })]]);
  let restored: PropertySubmission | null = submission;
  let fail = true; let creates = 0; let nextForm: unknown; let closed = false;
  const env = {
    cancelled: false, setLoading: () => {}, setError: () => {}, DRAFT_STORAGE_KEY: "credentials", localFormKey: (id: string) => `local:${id}`,
    localStorage: { getItem: (key: string) => stored.get(key), setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) },
    loadSellerDraft: async () => { if (fail) throw new Error("offline"); return restored; },
    fetch: async () => { creates++; return response(200, { id: "draft-b", token: "new-token" }); },
    setDraft: () => {}, setSubmitted: () => { closed = true; }, frozen: { current: false },
    fromDraft: () => ({ contact_phone: "0812345678", title: "server value" }), storageId: { current: null }, formRef: { current: null }, savedForm: { current: null }, savedPayload: { current: null },
    setDraftId: () => {}, setToken: () => {}, setFormState: (value: unknown) => { nextForm = value; }, setSaveState: () => {}, emptyForm: {},
  };
  const init = handler("init", env);
  await assert.rejects(init()); assert.equal(creates, 0);
  assert.equal(JSON.parse(stored.get("credentials")!).token, "original-token");
  fail = false; await init();
  assert.deepEqual(nextForm, { title: "local edit", contact_phone: "0812" });
  restored = { ...submission, status: "published" }; nextForm = undefined;
  await init(); assert.equal(closed, true); assert.equal(env.frozen.current, true); assert.equal(nextForm, undefined);
  restored = null; await init(); assert.equal(creates, 0, "a missing draft is not recreated on view");
  assert.equal(stored.has("credentials"), false, "dead credentials are dropped on a definitive 404");
  assert.equal(stored.has("local:draft-a"), false, "the dead draft's local form is dropped with it");
});

test("corrupt credentials are removed with only their identifiable local draft without creating a draft", async () => {
  const stored = new Map([["credentials", '{"id":"draft-broken",'], ["local:draft-broken", "bad draft"], ["other", "keep"]]);
  let created = 0;
  const env = {
    cancelled: false, setLoading: () => {}, setError: () => {}, DRAFT_STORAGE_KEY: "credentials", localFormKey: (id: string) => `local:${id}`,
    localStorage: { getItem: (key: string) => stored.get(key), setItem: (key: string, value: string) => stored.set(key, value), removeItem: (key: string) => stored.delete(key) },
    loadSellerDraft: async () => { throw new Error("corrupt credentials must not be used"); },
    fetch: async () => { created++; return response(200, { id: "fresh", token: "fresh-token" }); },
    setDraft: () => {}, setSubmitted: () => {}, frozen: { current: false }, fromDraft: () => ({}),
    storageId: { current: null }, formRef: { current: null }, savedForm: { current: null }, savedPayload: { current: null },
    setDraftId: () => {}, setToken: () => {}, setFormState: () => {}, setSaveState: () => {}, emptyForm: {},
  };
  await handler("init", env)();
  assert.equal(created, 0);
  assert.equal(stored.has("credentials"), false);
  assert.equal(stored.has("local:draft-broken"), false);
  assert.equal(stored.get("other"), "keep");
});

test("ListingCard falls back to usable area instead of showing zero rai", () => {
  const card = read("../components/listings/ListingCard.tsx");
  assert.match(card, /exactTotalRai > 0/);
  assert.match(card, /return propertySizeLabel\(land\)/);
});

test("form edits persist immediately under their draft ID and are blocked during submit", () => {
  const writes: [string, string][] = [];
  const formRef = { current: { contact_phone: "0812345678", title: "saved" } };
  const frozen = { current: false };
  const setForm = handler("setForm", { frozen, formRef, setFormState: () => {}, setSaveState: () => {}, storageId: { current: "draft-a" }, localFormKey: (id: string) => `draft:${id}`, localStorage: { setItem: (key: string, value: string) => writes.push([key, value]) }, setError: () => {} });
  setForm((current: typeof formRef.current) => ({ ...current, contact_phone: "0812" }));
  assert.equal(writes[0][0], "draft:draft-a");
  assert.equal(JSON.parse(writes[0][1]).contact_phone, "0812");
  frozen.current = true;
  setForm(() => ({ title: "too late", contact_phone: "" }));
  assert.equal(writes.length, 1);
  assert.equal(formRef.current.title, "saved");
});

test("older save completion cannot mark newer local edits saved; transient failure can recover", async () => {
  let draft = submission;
  let state = "unsaved";
  const savedForm = { current: JSON.stringify({ title: "saved", contact_phone: "0812345678" }) };
  const current = { title: "newer", contact_phone: "0812345678" };
  let status = 200;
  let retryable = false;
  const persist = handler("persist", {
    draftId: "draft-a", token: "token", savedForm, savedPayload: { current: null }, formRef: { current },
    setSaveState: (value: string) => { state = value; }, setSaveError: () => {}, setSaveRetryable: (value: boolean) => { retryable = value; },
    setDraft: (update: (value: PropertySubmission) => PropertySubmission) => { draft = update(draft); },
    fetch: async () => response(status, { draft: { ...submission, media: undefined } }),
    SERVER_FIELD_LABELS: {}, mergeDraft, phoneLooksValid: (value: string) => /^0\d{8,9}$/.test(value),
  });
  const old = JSON.stringify({ title: "older", contact_phone: "0812345678" });
  assert.equal(await persist(old, old), true);
  assert.equal(state, "unsaved");
  assert.deepEqual(draft.media, submission.media);
  status = 503;
  const latest = JSON.stringify(current);
  assert.equal(await persist(latest, latest), false);
  assert.equal(state, "error");
  assert.equal(retryable, true);
  status = 400;
  assert.equal(await persist(latest, latest), false);
  assert.equal(retryable, false, "validation failures need edits, not repeated retries");
  status = 200;
  assert.equal(await persist(latest, latest), true);
  assert.equal(state, "saved");
  const baseline = savedForm.current;
  assert.equal(await persist('{"title":"newer"}', '{"title":"newer","contact_phone":"0812"}'), true);
  assert.equal(savedForm.current, baseline, "an omitted partial phone is never acknowledged as saved");
});

test("reverting to the saved form during an in-flight save schedules a corrective autosave on completion", async () => {
  const original = { title: "original", contact_phone: "0812345678" };
  const edited = { ...original, title: "edited" };
  const pending = deferred<Response>();
  let state = "unsaved";
  const savedPayload = { current: JSON.stringify(original) };
  const savedForm = { current: JSON.stringify(original) };
  const formRef = { current: edited };
  const setState = (value: string | ((current: string) => string)) => { state = typeof value === "function" ? value(state) : value; };
  const persist = handler("persist", { draftId: "draft-a", token: "token", savedPayload, savedForm, formRef, setSaveState: setState, setSaveError: () => {}, setSaveRetryable: () => {}, fetch: () => pending.promise, setDraft: () => {}, SERVER_FIELD_LABELS: {}, phoneLooksValid: () => true });
  const done = persist(JSON.stringify(edited), JSON.stringify(edited));
  const setForm = handler("setForm", { frozen: { current: false }, formRef, setFormState: () => {}, setSaveState: setState, storageId: { current: null } });
  setForm(() => original);
  assert.equal(state, "saving", "edits keep the in-flight state until the request completes");
  pending.resolve(response(200)); await done;
  assert.equal(state, "unsaved");
  assert.notEqual(savedPayload.current, JSON.stringify(original));
  const start = wizard.indexOf("  // Restored local edits");
  const end = wizard.indexOf('  useEffect(() => {\n    if (saveState !== "error"', start);
  const effects: (() => void)[] = []; const timers: unknown[] = [];
  const env = { useEffect: (callback: () => void, deps: unknown[]) => { assert.ok(deps.includes("unsaved")); effects.push(callback); }, payload: JSON.stringify(original), formSnapshot: JSON.stringify(original), savedForm, savedPayload, loading: false, submitting: false, submitted: false, draftId: "draft-a", token: "token", saveState: state, AUTOSAVE_DELAY_MS: 1500, saveDraftRef: { current: () => {} }, setTimeout: (fn: unknown) => { timers.push(fn); }, clearTimeout: () => {} };
  new Function(...Object.keys(env), stripTypeScriptTypes(wizard.slice(start, end)))(...Object.values(env));
  effects[0](); assert.equal(timers.length, 1);
});

test("save queue serializes requests and blocks late autosaves after submit freezes", async () => {
  const pending = deferred<boolean>();
  const calls: string[] = [];
  const frozen = { current: false };
  const env = { frozen, payload: "latest", formSnapshot: "latest form", savedPayload: { current: "older" }, saveQueue: { current: pending.promise }, persist: async (body: string) => { calls.push(body); return true; } };
  const saveDraft = handler("saveDraft", env);
  const first = saveDraft();
  frozen.current = true;
  assert.equal(await saveDraft(), false);
  const final = saveDraft(true);
  assert.deepEqual(calls, []);
  pending.resolve(true); await Promise.all([first, final]);
  assert.deepEqual(calls, ["latest", "latest"]);
});

test("submit freezes first, waits for every upload and queued save, then saves once and submits", async () => {
  const a = deferred<boolean>(); const b = deferred<boolean>(); const pendingSave = deferred<boolean>();
  const events: string[] = [];
  const frozen = { current: false };
  const submit = handler("submit", {
    frozen, validate: () => ({}), setFieldErrors: () => {}, draftId: "draft-a", token: "token", buyerDemandSlug: undefined,
    cancelMapsLookup: () => events.push("cancel lookup"), setSubmitting: () => {}, setError: () => {},
    uploadBatches: { current: new Set([a.promise, b.promise]) }, failedUploads: { current: new Map() }, saveQueue: { current: pendingSave.promise },
    saveDraft: async (force: boolean) => { assert.equal(force, true); events.push("save latest"); return true; },
    turnstile: { headers: () => ({ "x-turnstile-token": "uat-token" }), reset: () => events.push("reset challenge") },
    fetch: async (_url: string, init: { headers: Record<string, string> }) => { assert.equal(init.headers["x-turnstile-token"], "uat-token"); events.push("submit"); return response(200); }, setSubmitted: () => events.push("submitted"),
    localStorage: { removeItem: () => {} }, DRAFT_STORAGE_KEY: "draft", localFormKey: (id: string) => id,
  });
  const done = submit();
  assert.equal(frozen.current, true);
  a.resolve(true); await Promise.resolve();
  assert.deepEqual(events, ["cancel lookup"]);
  b.resolve(true); await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["cancel lookup"]);
  pendingSave.resolve(true); await done;
  assert.deepEqual(events, ["cancel lookup", "save latest", "submit", "reset challenge", "submitted"]);
});

test("overlapping upload batches remain tracked until both complete and keep both media lists", async () => {
  const a = deferred<boolean>(); const b = deferred<boolean>();
  const uploadBatches = { current: new Set<Promise<boolean>>() };
  let count = 0; let draft: PropertySubmission = { ...submission, media: [] };
  let loads = 0;
  const uploadBatch = handler("uploadBatch", {
    frozen: { current: false }, draftId: "draft-a", token: "token", uploadBatches,
    setError: () => {}, setUploadBatchCount: (update: (value: number) => number) => { count = update(count); },
    upload: (file: string) => file === "a" ? a.promise : b.promise,
    loadSellerDraft: async () => ({ ...submission, media: [{ id: ++loads === 1 ? "a" : "b" }] }), mergeDraft,
    setDraft: (update: (value: PropertySubmission) => PropertySubmission) => { draft = update(draft); },
  });
  uploadBatch(["a"], "image"); uploadBatch(["b"], "document");
  assert.equal(count, 2);
  a.resolve(true); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(count, 1); assert.equal(uploadBatches.current.size, 1);
  b.resolve(true); await Promise.all([...uploadBatches.current]); await Promise.resolve();
  assert.equal(count, 0); assert.equal(uploadBatches.current.size, 0);
  assert.deepEqual(draft.media?.map((item) => item.id), ["a", "b"]);
});

test("upload or submit before any draft exists creates it through ensureDraft and targets the new id", async () => {
  // Upload first: files go to the created draft; a failed create keeps them retryable instead of dropping them.
  const failedUploads = { current: new Map<string, string>() };
  const uploaded: string[] = []; let creates = 0; let createFails = false;
  const uploadBatch = handler("uploadBatch", {
    frozen: { current: false }, draftId: null, token: null, uploadBatches: { current: new Set() }, failedUploads,
    setError: () => {}, setUploadBatchCount: () => {}, mergeDraft, setDraft: () => {},
    ensureDraft: async () => { creates++; if (createFails) throw new Error("create failed"); return { id: "draft-new", token: "tok" }; },
    upload: async (file: string, _kind: string, target: { id: string; token: string }) => { uploaded.push(`${file}->${target.id}:${target.token}`); return true; },
    loadSellerDraft: async (id: string) => ({ ...submission, id, media: [] }),
  });
  uploadBatch(["a.jpg"], "image");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(creates, 1);
  assert.deepEqual(uploaded, ["a.jpg->draft-new:tok"]);
  createFails = true;
  uploadBatch(["b.pdf"], "document");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(uploaded, ["a.jpg->draft-new:tok"], "nothing uploads without a draft");
  assert.equal(failedUploads.current.get("b.pdf"), "document", "files stay queued for the retry button");

  // Submit first: the forced save creates the draft; submit reuses it and still carries the Turnstile token.
  const calls: { url: string; headers: Record<string, string>; body: { token: string } }[] = [];
  const submit = handler("submit", {
    validate: () => ({}), setFieldErrors: () => {}, consent: true, frozen: { current: false }, draftId: null, token: null,
    cancelMapsLookup: () => {}, setSubmitting: () => {}, setError: (message: unknown) => assert.equal(message, null), buyerDemandSlug: undefined,
    uploadBatches: { current: new Set() }, failedUploads: { current: new Map() }, saveQueue: { current: Promise.resolve(true) },
    saveDraft: async () => true, ensureDraft: async () => ({ id: "draft-new", token: "tok" }),
    turnstile: { headers: () => ({ "x-turnstile-token": "uat-token" }), reset: () => {} },
    fetch: async (url: string, init: { headers: Record<string, string>; body: string }) => { calls.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return response(200); },
    setSubmitted: () => {}, localStorage: { removeItem: () => {} }, DRAFT_STORAGE_KEY: "draft", localFormKey: (id: string) => id,
  });
  await submit();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/property-submissions/draft-new/submit");
  assert.equal(calls[0].body.token, "tok");
  assert.equal(calls[0].headers["x-turnstile-token"], "uat-token");
});

test("submit resets the single-use Turnstile token on network failure and on a rejected response", async () => {
  for (const outcome of ["offline", "403"] as const) {
    let resets = 0; let error: unknown = null; let submitted = false;
    const submit = handler("submit", {
      validate: () => ({}), setFieldErrors: () => {}, frozen: { current: false }, draftId: "draft-a", token: "token", buyerDemandSlug: undefined,
      cancelMapsLookup: () => {}, setSubmitting: () => {}, setError: (message: unknown) => { error = message; },
      uploadBatches: { current: new Set() }, failedUploads: { current: new Map() }, saveQueue: { current: Promise.resolve(true) },
      saveDraft: async () => true, ensureDraft: async () => { throw new Error("draft already exists"); },
      turnstile: { headers: () => ({ "x-turnstile-token": "used" }), reset: () => { resets++; } },
      fetch: async () => { if (outcome === "offline") throw new Error("offline"); return response(403, { error: "verification failed" }); },
      setSubmitted: () => { submitted = true; }, localStorage: { removeItem: () => {} }, DRAFT_STORAGE_KEY: "draft", localFormKey: (id: string) => id,
    });
    await submit();
    assert.equal(resets, 1, `${outcome}: challenge reset exactly once`);
    assert.equal(submitted, false);
    assert.ok(error, `${outcome}: seller sees an error`);
  }
});

test("old Maps responses cannot overwrite a manual pin or newer lookup", async () => {
  const pending = deferred<Response>();
  const mapsRequest = { current: 0 };
  const pins: unknown[] = [];
  const resolve = handler("resolveMapsLink", {
    frozen: { current: false }, mapsRequest, mapsInput: "13.5,101.5", setMapsStatus: () => {},
    fetch: () => pending.promise, setForm: (value: unknown) => pins.push(value), setMapFocus: () => {},
  });
  const done = resolve(); mapsRequest.current++;
  pending.resolve(response(200, { lat: 13.5, lng: 101.5 })); await done;
  assert.deepEqual(pins, []);
});

test("Maps explicit pins outrank camera hints regardless of URL order; camera-only links require a pin", async () => {
  for (const input of [
    "https://www.google.com/maps/@13.1,100.1,16z",
    "https://maps.google.com/?ll=13.1,100.1&center=13.2,100.2",
  ]) {
    assert.equal(coordinatesFromMapsUrl(new URL(input)), null);
    assert.deepEqual(await resolveMapsInput(input), { ok: false, error: MAPS_LINK_ERRORS.noCoordinates });
  }
  for (const query of ["ll=13.1,100.1&destination=13.5,101.5", "destination=13.5,101.5&ll=13.1,100.1"]) {
    assert.deepEqual(coordinatesFromMapsUrl(new URL(`https://maps.google.com/?${query}`)), { lat: 13.5, lng: 101.5 });
    assert.deepEqual(coordinatesFromMapsUrl(new URL(`https://www.google.com/maps/@13.1,100.1/data=!3d13.6!4d101.6?${query}`)), { lat: 13.6, lng: 101.6 });
  }
  assert.equal(coordinatesFromMapsUrl(new URL("https://evil.example/maps/data=!3d13.6!4d101.6")), null);
});

test("location ordering, native radios, invalid-field focus, restore lock and single marker path stay wired", () => {
  assert.ok(wizard.indexOf('value={form.subdistrict}') < wizard.indexOf('id="sell-maps-link"'));
  assert.match(wizard, /type="radio" name="property_type"/);
  assert.match(wizard, /querySelector<HTMLElement>.*data-sell-field/);
  assert.match(wizard, /restored\.status !== "draft"/);
  assert.match(wizard, /baseline, \.\.\.local/);
  assert.match(wizard, /window\.addEventListener\("online", retry\)/);
  const picker = read("../components/forms/LocationPicker.tsx");
  assert.equal((picker.match(/L\.marker\(/g) ?? []).length, 1);
  assert.match(picker, /markerRef\.current = L\.marker/);
  assert.match(picker, /sell-location-pin-wrap/);
  assert.match(picker, /M18\.364 4\.636a9 9 0 0 1/);
  assert.match(picker, /fill="currentColor"/);
  assert.match(picker, /\[lat, lng, mapReady\]/);
});

test("restore keeps a pre-structured local zoning color and mirrors it into zoning_info", async () => {
  const empty = { zones: [], status: "unknown", plan_name: "", source: "", checked_at: "", evidence_url: "" };
  for (const [local, expected] of [
    [{ zoning: "purple", title: "local" }, { zoning: "purple", zones: [{ color: "purple", type_code: "", type_name: "" }] }],
    [{ zoning: "brown", title: "local" }, { zoning: "brown", zones: [{ color: "brown", type_code: "", type_name: "" }] }],
    [{ title: "local" }, { zoning: "brown", zones: [{ color: "brown", type_code: "", type_name: "" }] }],
  ] as const) {
    let nextForm: Record<string, unknown> = {};
    const stored = new Map([["credentials", JSON.stringify({ id: "draft-a", token: "t" })], ["local:draft-a", JSON.stringify(local)]]);
    await handler("init", {
      cancelled: false, setLoading: () => {}, setError: () => {}, DRAFT_STORAGE_KEY: "credentials", localFormKey: (id: string) => `local:${id}`,
      localStorage: { getItem: (key: string) => stored.get(key), setItem: () => {} }, loadSellerDraft: async () => submission,
      fetch: async () => { throw new Error("must restore"); }, setDraft: () => {}, setSubmitted: () => {}, frozen: { current: false },
      fromDraft: () => ({ title: "server", zoning: "brown", zoning_info: { ...empty, zones: [{ color: "brown", type_code: "", type_name: "" }] } }),
      storageId: { current: null }, formRef: { current: null }, savedForm: { current: null }, savedPayload: { current: null },
      setDraftId: () => {}, setToken: () => {}, setFormState: (value: Record<string, unknown>) => { nextForm = value; }, setSaveState: () => {}, emptyForm: {},
    })();
    assert.equal(nextForm.zoning, expected.zoning);
    assert.deepEqual((nextForm.zoning_info as { zones: unknown }).zones, expected.zones);
  }
});

test("viewing /sell never creates a draft; the first edit, upload or submit does, once, keeping local edits", async () => {
  // Static guard: the only POST to the collection endpoint lives in ensureDraft, never in init.
  const initSource = wizard.slice(wizard.indexOf("async function init()"), wizard.indexOf("  }, [restoreAttempt]);"));
  assert.doesNotMatch(initSource, /property-submissions/);
  assert.equal(wizard.split('fetch("/api/property-submissions", { method: "POST", headers: human })').length - 1, 1);

  // Initial visit: no credentials, so init must not hit the network at all.
  let posts = 0;
  const stored = new Map<string, string>();
  const init = handler("init", {
    cancelled: false, setLoading: () => {}, setError: () => {}, DRAFT_STORAGE_KEY: "credentials", localFormKey: (id: string) => `local:${id}`,
    localStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: () => {}, removeItem: () => {} },
    loadSellerDraft: async () => { throw new Error("nothing to restore"); }, fetch: async () => { posts++; return response(200, { id: "x", token: "t" }); },
    setDraft: () => {}, setSubmitted: () => {}, frozen: { current: false }, fromDraft: () => ({}),
    storageId: { current: null }, formRef: { current: null }, savedForm: { current: null }, savedPayload: { current: null },
    setDraftId: () => {}, setToken: () => {}, setFormState: () => {}, setSaveState: () => {}, emptyForm: {},
  });
  await init();
  assert.equal(posts, 0, "GET /sell must not POST");

  // Pristine form: the no-draft autosave effect schedules nothing. First edit: it schedules the save that creates the draft.
  const pristine = JSON.stringify({ title: "" });
  const start = wizard.indexOf("  // No draft exists until");
  const end = wizard.indexOf("  // Restored local edits", start);
  const run = (formSnapshot: string, saveState = "saved", overrides: Record<string, unknown> = {}) => {
    const timers: unknown[] = []; const effects: (() => void)[] = [];
    const env = { useEffect: (callback: () => void) => { effects.push(callback); }, loading: false, submitting: false, submitted: false, draftId: null, initFailed: false, saveState, formSnapshot, savedForm: { current: pristine }, AUTOSAVE_DELAY_MS: 1500, saveDraftRef: { current: () => {} }, setTimeout: (fn: unknown) => { timers.push(fn); }, clearTimeout: () => {}, draftTurnstile: { enabled: false, token: null }, ...overrides };
    new Function(...Object.keys(env), stripTypeScriptTypes(wizard.slice(start, end)))(...Object.values(env));
    effects[0](); return timers.length;
  };
  assert.equal(run(pristine), 0);
  assert.equal(run(JSON.stringify({ title: "edited" })), 1);
  assert.equal(run(JSON.stringify({ title: "edited" }), "error"), 0, "failed create waits for the retry timer instead of looping");
  const edited = JSON.stringify({ title: "edited" });
  assert.equal(run(edited, "saved", { loading: true }), 0, "nothing is created while the restore is loading");
  assert.equal(run(edited, "saved", { initFailed: true }), 0, "a failed restore never falls through to creating a new draft");
  assert.equal(run(edited, "saved", { submitted: true }), 0);
  assert.equal(run(edited, "saved", { draftId: "existing" }), 0, "an existing draft uses normal autosave, not create");
  assert.equal(run(edited, "saved", { draftTurnstile: { enabled: true, token: null } }), 0, "first edit waits for the draft Turnstile token");
  assert.equal(run(edited, "saved", { draftTurnstile: { enabled: true, token: "cf-token" } }), 1, "token arrival schedules the create");

  // ensureDraft: concurrent callers share one POST, a failed POST is retryable, credentials and local edits are stored on success.
  let calls = 0; let fail = true;
  const gate = deferred<void>();
  const state = { draftId: null as string | null, token: null as string | null, error: null as string | null };
  const writes = new Map<string, string>();
  const ensureDraft = handler("ensureDraft", {
    credentials: { current: null }, creating: { current: null }, draftId: null, token: null, storageId: { current: null }, formRef: { current: { title: "keep me" } },
    DRAFT_STORAGE_KEY: "credentials", localFormKey: (id: string) => `local:${id}`, localStorage: { setItem: (key: string, value: string) => writes.set(key, value) },
    setError: (message: string) => { state.error = message; }, setDraftId: (id: string) => { state.draftId = id; }, setToken: (value: string) => { state.token = value; },
    fetch: async () => { calls++; await gate.promise; return fail ? response(503) : response(200, { id: "draft-new", token: "tok" }); },
    draftTurnstile: { enabled: false, headers: () => ({}), reset: () => {} },
  });
  const first = ensureDraft(); const second = ensureDraft();
  gate.resolve(); await assert.rejects(first); await assert.rejects(second);
  assert.equal(calls, 1, "concurrent first edits share a single POST");
  assert.equal(state.draftId, null, "failure leaves no half-created draft");
  fail = false;
  assert.deepEqual(await ensureDraft(), { id: "draft-new", token: "tok" });
  assert.equal(calls, 2);
  assert.equal(JSON.parse(writes.get("local:draft-new")!).title, "keep me", "unsaved edits are mirrored under the new draft id");
  assert.equal(JSON.parse(writes.get("credentials")!).id, "draft-new");
  assert.equal(state.draftId, "draft-new");
});

test("draft creation with Turnstile on: no token = no POST; token sent once, widget reset after every attempt; server reason surfaced", async () => {
  const sent: (Record<string, string> | undefined)[] = [];
  let resets = 0;
  let tokenNow: string | null = null;
  let reply = response(403, { error: "กรุณายืนยันว่าคุณไม่ใช่บอท แล้วลองอีกครั้ง", code: "human_verification_failed" });
  const state = { draftId: null as string | null };
  const ensureDraft = handler("ensureDraft", {
    credentials: { current: null }, creating: { current: null }, draftId: null, token: null, storageId: { current: null }, formRef: { current: {} },
    DRAFT_STORAGE_KEY: "credentials", localFormKey: (id: string) => `local:${id}`, localStorage: { setItem: () => {} },
    setError: () => {}, setDraftId: (id: string) => { state.draftId = id; }, setToken: () => {},
    fetch: async (_url: string, init: RequestInit) => { sent.push(init.headers as Record<string, string>); return reply; },
    draftTurnstile: { enabled: true, headers: () => (tokenNow ? { "x-turnstile-token": tokenNow } : {}), reset: () => { resets++; tokenNow = null; } },
  });
  await assert.rejects(ensureDraft(), /ยืนยันว่าคุณไม่ใช่บอท/);
  assert.equal(sent.length, 0, "a tokenless create is never sent, so it cannot touch the quota");
  tokenNow = "cf-1";
  await assert.rejects(ensureDraft(), (e: Error & { retryable?: boolean }) => /กรุณายืนยันว่าคุณไม่ใช่บอท แล้วลองอีกครั้ง/.test(e.message) && e.retryable === true, "403 reason shown and retried with the next fresh token");
  assert.deepEqual(sent, [{ "x-turnstile-token": "cf-1" }]);
  assert.equal(resets, 1, "single-use token reset after a failed attempt");
  tokenNow = "cf-2"; reply = response(429, { error: "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่", code: "rate_limited" });
  await assert.rejects(ensureDraft(), (e: Error & { retryable?: boolean }) => /บ่อยเกินไป/.test(e.message) && e.retryable === false, "429 stops the 5 s auto-retry loop");
  tokenNow = "cf-3"; reply = response(500, { error: "Unable to create draft" });
  await assert.rejects(ensureDraft(), /ไม่สามารถสร้างแบบร่างได้/, "5xx keeps the Thai generic message");
  tokenNow = "cf-4"; reply = response(201, { id: "draft-ok", token: "tok" });
  assert.deepEqual(await ensureDraft(), { id: "draft-ok", token: "tok" });
  assert.deepEqual(sent.map((h) => h?.["x-turnstile-token"]), ["cf-1", "cf-2", "cf-3", "cf-4"], "each attempt used a fresh token");
  assert.equal(resets, 4);
  assert.equal(state.draftId, "draft-ok");
  assert.ok(wizard.includes('{!draftId && <div className="px-4 sm:px-8"><TurnstileWidget onToken={draftTurnstile.onToken} action="property-draft" resetKey={draftTurnstile.resetKey} /></div>}'), "draft widget mounted until the draft exists");
});
