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
    cancelled: false, setLoading: () => {}, setError: () => {}, setRestoreFailed: () => {}, DRAFT_STORAGE_KEY: "credentials", localFormKey: (id: string) => `local:${id}`,
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
  restored = null; await init(); assert.equal(creates, 0, "a missing draft never creates on load");
  assert.equal(stored.has("credentials"), false, "stale credentials are dropped; the next edit creates a new draft");
  assert.equal(stored.has("local:draft-a"), false);
});

test("corrupt credentials are removed with only their identifiable local draft and load never creates a draft", async () => {
  const stored = new Map([["credentials", '{"id":"draft-broken",'], ["local:draft-broken", "bad draft"], ["other", "keep"]]);
  let created = 0;
  const env = {
    cancelled: false, setLoading: () => {}, setError: () => {}, setRestoreFailed: () => {}, DRAFT_STORAGE_KEY: "credentials", localFormKey: (id: string) => `local:${id}`,
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

test("sell form does not create a draft on view; the first edit creates exactly one", async () => {
  // Only ensureDraft may POST the collection endpoint; the restore effect must never create.
  assert.equal(wizard.split('fetch("/api/property-submissions", { method: "POST" })').length, 2, "single create call site");
  const init = wizard.slice(wizard.indexOf("async function init()"), wizard.indexOf("}, [restoreAttempt]);"));
  assert.doesNotMatch(init, /method: "POST"/, "mount/restore never creates a draft");
  assert.match(wizard, /restoreFailed && !draftId && !submitted/, "failed restore is distinct from not-yet-created");

  const start = wizard.indexOf("  const ensureDraft = useCallback(");
  const end = wizard.indexOf("  async function persist(", start);
  const posts: string[] = [];
  const gate = deferred<Response>();
  const state: Record<string, unknown> = {};
  const effects: (() => void | (() => void))[] = [];
  const env = {
    useCallback: (fn: unknown) => fn, useEffect: (fn: () => void) => { effects.push(fn); },
    fetch: (url: string) => { posts.push(url); return gate.promise; },
    localStorage: { setItem: () => {} }, DRAFT_STORAGE_KEY: "k", localFormKey: (id: string) => id,
    creatingDraft: { current: null }, storageId: { current: null }, formRef: { current: {} },
    setCreateFailure: () => {}, setDraftId: (v: unknown) => { state.draftId = v; }, setToken: (v: unknown) => { state.token = v; },
    formSnapshot: "dirty", emptyForm: {}, pendingFiles: { current: [] },
    loading: false, submitted: false, draftId: null, restoreFailed: false, createFailure: null, setTimeout, clearTimeout,
  };
  const run = (overrides: Record<string, unknown> = {}) => {
    effects.length = 0;
    new Function(...Object.keys({ ...env, ...overrides }), stripTypeScriptTypes(wizard.slice(start, end)))(...Object.values({ ...env, ...overrides }));
    effects[0]?.();
  };
  run({ formSnapshot: "{}" });
  assert.deepEqual(posts, [], "pristine form: viewing creates nothing");
  run({ restoreFailed: true });
  run({ loading: true });
  assert.deepEqual(posts, [], "loading or failed restore creates nothing");
  run(); run();
  assert.equal(posts.length, 1, "first edit creates one draft; concurrent triggers share the request");
  gate.resolve(response(200, { id: "draft-new", token: "t" }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.draftId, "draft-new");
});
