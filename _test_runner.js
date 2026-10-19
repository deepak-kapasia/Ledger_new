// backend-ledger — Final Comprehensive Test
// Usage: node test.js  (from project root)
"use strict";

const BASE = "http://localhost:3000";
const PROJECT_ROOT = __dirname;
const RUN_ID = `${Date.now()}-${process.pid}`;
const ALICE_EMAIL = `alice-${RUN_ID}@test.com`;
const BOB_EMAIL = `bob-${RUN_ID}@test.com`;
let PASS = 0, FAIL = 0;
const results = [];

function ok(label) {
  console.log(`  \x1b[32m✅\x1b[0m ${label}`);
  PASS++;
}
function fail(label, got, expected) {
  console.log(`  \x1b[31m❌\x1b[0m ${label}`);
  if (expected !== undefined) console.log(`       expected: ${expected}`);
  if (got !== undefined) console.log(`       got:      ${String(got).slice(0, 120)}`);
  FAIL++;
}
function check(label, condition, got, expected) {
  condition ? ok(label) : fail(label, got, expected);
}
function section(t) {
  console.log(`\n\x1b[36m\x1b[1m── ${t}\x1b[0m`);
}

async function api(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(`${BASE}${path}`, opts);
    let data;
    try { data = await r.json(); } catch { data = {}; }
    return { status: r.status, data, headers: r.headers };
  } catch (e) {
    return { status: 0, data: { message: e.message }, headers: new (require("http").IncomingMessage)() };
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const { execSync } = require("child_process");
const fs = require("fs");
const mongoose = require(require("path").join(PROJECT_ROOT, "backend/node_modules/mongoose"));
const TEST_MONGO_URI = process.env.TEST_MONGO_URI || "mongodb://localhost:27017/ledger";

(async () => {

  console.log("\x1b[1m═══════════════════════════════════════════════════\x1b[0m");
  console.log("\x1b[1m   BACKEND LEDGER — FINAL COMPREHENSIVE TEST SUITE\x1b[0m");
  console.log("\x1b[1m═══════════════════════════════════════════════════\x1b[0m");

  // ─── 1. SERVER HEALTH ─────────────────────────────
  section("1. SERVER HEALTH");
  {
    const r = await api("GET", "/");
    check("GET / → 200 health message", r.status === 200);
  }

  // ─── 2. CORS ──────────────────────────────────────
  section("2. CORS HEADERS");
  {
    const goodOrigin = await fetch(`${BASE}/`, { headers: { Origin: "http://localhost:5173" } });
    check("Allows frontend origin (localhost:5173)",
      goodOrigin.headers.get("access-control-allow-origin") === "http://localhost:5173");
    const badOrigin = await fetch(`${BASE}/`, { headers: { Origin: "http://evil.com" } });
    check("Blocks evil.com origin",
      badOrigin.headers.get("access-control-allow-origin") !== "http://evil.com");
  }

  // ─── 3. REGISTER (before rate limit) ─────────────
  section("3. AUTH — REGISTER");
  let TOKEN_A, TOKEN_B;
  {
    const r = await api("POST", "/api/auth/register",
      { name: "Alice", email: ALICE_EMAIL, password: "alice123" });
    check("Register Alice → 201", r.status === 201, r.status, 201);
    check("Returns user object with name", r.data.user?.name === "Alice");
    check("Returns JWT token", typeof r.data.token === "string" && r.data.token.length > 10);
    check("Does NOT expose password", !r.data.user?.password);
    TOKEN_A = r.data.token;

    const r2 = await api("POST", "/api/auth/register",
      { name: "Bob", email: BOB_EMAIL, password: "bob123" });
    check("Register Bob → 201", r2.status === 201, r2.status, 201);
    TOKEN_B = r2.data.token;

    const dup = await api("POST", "/api/auth/register",
      { name: "Alice2", email: ALICE_EMAIL, password: "x" });
    check("Duplicate email → 422", dup.status === 422, dup.status, 422);
    check("Duplicate email returns status:failed", dup.data.status === "failed");
  }

  // ─── 4. COOKIE SECURITY ───────────────────────────
  section("4. AUTH — COOKIE SECURITY");
  {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ALICE_EMAIL, password: "alice123" })
    });
    const cookie = r.headers.get("set-cookie") || "";
    TOKEN_A = (await r.json()).token || TOKEN_A;
    check("Cookie has HttpOnly", cookie.toLowerCase().includes("httponly"), cookie);
    check("Cookie has SameSite=Strict", cookie.toLowerCase().includes("samesite=strict"), cookie);
    check("Cookie has Max-Age (3-day expiry)", cookie.toLowerCase().includes("max-age"), cookie);

    // Re-login Bob separately
    const r2 = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: BOB_EMAIL, password: "bob123" })
    });
    TOKEN_B = (await r2.json()).token || TOKEN_B;
  }

  // ─── 5. LOGIN VALIDATION ──────────────────────────
  section("5. AUTH — LOGIN");
  {
    const bad = await api("POST", "/api/auth/login",
      { email: ALICE_EMAIL, password: "WRONG" });
    check("Wrong password → 401", bad.status === 401, bad.status, 401);
    check("Wrong password says INVALID", bad.data.message?.includes("INVALID"));

    const ghost = await api("POST", "/api/auth/login",
      { email: "ghost@test.com", password: "ghost" });
    check("Non-existent user → 401", ghost.status === 401, ghost.status, 401);
  }


  // ─── 7. ACCOUNTS ──────────────────────────────────
  section("7. ACCOUNTS — CREATE & LIST");
  let ACCOUNT_A1, ACCOUNT_A2, ACCOUNT_B1;
  {
    const noAuth = await api("POST", "/api/accounts/");
    check("Create account without auth → 401", noAuth.status === 401, noAuth.status, 401);

    const a1 = await api("POST", "/api/accounts/", null, TOKEN_A);
    check("Alice creates Account A1 → 201", a1.status === 201, a1.status, 201);
    check("A1 status = ACTIVE", a1.data.account?.status === "ACTIVE");
    check("A1 currency = INR", a1.data.account?.currency === "INR");
    ACCOUNT_A1 = a1.data.account?._id;

    const a2 = await api("POST", "/api/accounts/", null, TOKEN_A);
    check("Alice creates Account A2 → 201", a2.status === 201, a2.status, 201);
    ACCOUNT_A2 = a2.data.account?._id;

    const b1 = await api("POST", "/api/accounts/", null, TOKEN_B);
    check("Bob creates Account B1 → 201", b1.status === 201, b1.status, 201);
    ACCOUNT_B1 = b1.data.account?._id;

    const list = await api("GET", "/api/accounts/", null, TOKEN_A);
    check("Alice lists accounts → 200", list.status === 200);
    check("Alice sees exactly 2 accounts", list.data.accounts?.length === 2,
      list.data.accounts?.length, 2);
    check("Alice's list does NOT include Bob's account",
      !list.data.accounts?.some(a => a._id === ACCOUNT_B1));
  }

  // ─── 8. BALANCE ───────────────────────────────────
  section("8. ACCOUNTS — BALANCE");
  {
    const bal = await api("GET", `/api/accounts/balance/${ACCOUNT_A1}`, null, TOKEN_A);
    check("Fresh A1 balance = 0", bal.data.balance === 0, bal.data.balance, 0);

    const crossBal = await api("GET", `/api/accounts/balance/${ACCOUNT_B1}`, null, TOKEN_A);
    check("Alice cannot check Bob's balance → 404", crossBal.status === 404, crossBal.status, 404);

    const badId = await api("GET", `/api/accounts/balance/000000000000000000000000`, null, TOKEN_A);
    check("Invalid account ID → 404", badId.status === 404, badId.status, 404);
  }

  // ─── 9. TRANSACTION VALIDATION ────────────────────
  section("9. TRANSACTIONS — VALIDATION");
  {
    const noAuth = await api("POST", "/api/transactions/");
    check("No auth → 401", noAuth.status === 401, noAuth.status, 401);

    const missing = await api("POST", "/api/transactions/",
      { fromAccount: "abc" }, TOKEN_A);
    check("Missing fields → 400", missing.status === 400, missing.status, 400);
    check("Missing fields message mentions 'required'",
      missing.data.message?.toLowerCase().includes("required"), missing.data.message);

    const insuf = await api("POST", "/api/transactions/",
      { fromAccount: ACCOUNT_A1, toAccount: ACCOUNT_A2, amount: 500, idempotencyKey: `insuf-${RUN_ID}` },
      TOKEN_A);
    check("Insufficient balance → 400", insuf.status === 400, insuf.status, 400);
    check("Insufficient balance message correct",
      insuf.data.message?.includes("Insufficient balance"), insuf.data.message);

    const badAcct = await api("POST", "/api/transactions/",
      { fromAccount: "000000000000000000000000", toAccount: "000000000000000000000001",
        amount: 10, idempotencyKey: `bad-acct-${RUN_ID}` }, TOKEN_A);
    check("Invalid account IDs → 400", badAcct.status === 400, badAcct.status, 400);
    check("Invalid accounts message correct",
      badAcct.data.message?.includes("Invalid"), badAcct.data.message);
  }

  // ─── 10. OWNERSHIP CHECK ──────────────────────────
  section("10. ACCOUNT OWNERSHIP — Bug #3 Fix");
  {
    const steal = await api("POST", "/api/transactions/",
      { fromAccount: ACCOUNT_A1, toAccount: ACCOUNT_B1, amount: 10, idempotencyKey: `steal-${RUN_ID}` },
      TOKEN_B);
    check("Bob cannot use Alice's account as source → 400",
      steal.status === 400, steal.status, 400);
    check("Ownership error message correct",
      steal.data.message?.includes("Invalid fromAccount or toAccount"), steal.data.message);
  }

  // ─── 11. FULL TRANSACTION FLOW ────────────────────
  section("11. FULL TRANSACTION FLOW (end-to-end)");
  {
    // Fund A1 directly via DB
    try {
      execSync(`mongosh ledger --quiet --eval "
        const aid = ObjectId('${ACCOUNT_A1}');
        const t = db.transactions.insertOne({
          fromAccount: ObjectId('000000000000000000000000'),
          toAccount: aid, amount: 10000,
          idempotencyKey: 'seed-final-${RUN_ID}',
          status: 'COMPLETED', createdAt: new Date(), updatedAt: new Date()
        });
        db.ledgers.insertOne({ account: aid, amount: 10000, transaction: t.insertedId, type: 'CREDIT' });
      "`, { stdio: "pipe" });
    } catch (e) { console.log("  ⚠️  DB seed failed:", e.message); }

    const funded = await api("GET", `/api/accounts/balance/${ACCOUNT_A1}`, null, TOKEN_A);
    check("A1 balance = 10000 after seeding", funded.data.balance === 10000,
      funded.data.balance, 10000);

    // Transfer 1
    const txn1 = await api("POST", "/api/transactions/",
      { fromAccount: ACCOUNT_A1, toAccount: ACCOUNT_A2, amount: 3000, idempotencyKey: `txn-001-${RUN_ID}` },
      TOKEN_A);
    check("Transfer 3000 A1→A2 → 201", txn1.status === 201, txn1.status, 201);
    check("Transfer response message correct",
      txn1.data.message?.includes("completed"), txn1.data.message);

    // Transfer 2
    const txn2 = await api("POST", "/api/transactions/",
      { fromAccount: ACCOUNT_A1, toAccount: ACCOUNT_A2, amount: 1000, idempotencyKey: `txn-002-${RUN_ID}` },
      TOKEN_A);
    check("Transfer 1000 A1→A2 → 201", txn2.status === 201, txn2.status, 201);

    // Check balances
    const balA1 = await api("GET", `/api/accounts/balance/${ACCOUNT_A1}`, null, TOKEN_A);
    check("A1 balance = 6000 after transfers", balA1.data.balance === 6000,
      balA1.data.balance, 6000);

    const balA2 = await api("GET", `/api/accounts/balance/${ACCOUNT_A2}`, null, TOKEN_A);
    check("A2 balance = 4000 after receiving", balA2.data.balance === 4000,
      balA2.data.balance, 4000);

    // Idempotency
    const idem = await api("POST", "/api/transactions/",
      { fromAccount: ACCOUNT_A1, toAccount: ACCOUNT_A2, amount: 3000, idempotencyKey: `txn-001-${RUN_ID}` },
      TOKEN_A);
    check("Duplicate idempotency key → 200 (not 201 or 500)",
      idem.status === 200, idem.status, 200);
    check("Duplicate key says already processed",
      idem.data.message?.includes("already processed"), idem.data.message);

    // Overdraft
    const over = await api("POST", "/api/transactions/",
      { fromAccount: ACCOUNT_A1, toAccount: ACCOUNT_A2, amount: 99999, idempotencyKey: `over-${RUN_ID}` },
      TOKEN_A);
    check("Overdraft rejected → 400", over.status === 400, over.status, 400);
    check("Overdraft message correct",
      over.data.message?.includes("Insufficient balance"), over.data.message);
  }

  // ─── 12. IDEMPOTENCY STATUS CODES ─────────────────
  section("12. IDEMPOTENCY — Status Codes (Bug #4 Fix)");
  {
    // Already tested COMPLETED→200 above. Now make a PENDING-like test via
    // checking the code check of re-using a completed key
    const r = await api("POST", "/api/transactions/",
      { fromAccount: ACCOUNT_A1, toAccount: ACCOUNT_A2, amount: 3000, idempotencyKey: `txn-001-${RUN_ID}` },
      TOKEN_A);
    check("Re-used completed key → 200 not 500", r.status === 200 && r.status !== 500,
      r.status, 200);
    check_code_not_500: {
      // Verify transaction controller code uses 400 not 500 for FAILED/REVERSED
      const src = fs.readFileSync(require("path").join(PROJECT_ROOT, "backend/src/controllers/transaction.controller.js"), "utf8");
      const hasCorrectStatus = src.includes('res.status(400)') &&
        src.includes('"FAILED"') && src.includes('"REVERSED"');
      check("Source code uses 400 (not 500) for FAILED/REVERSED idempotency", hasCorrectStatus);
    }
  }

  // ─── 13. LEDGER IMMUTABILITY ──────────────────────
  section("13. LEDGER IMMUTABILITY (Mongoose hook layer)");
  {
    await mongoose.connect(TEST_MONGO_URI);
    const LedgerModel = require(require("path").join(PROJECT_ROOT, "backend/src/models/ledger.model"));

    let updateBlocked = false;
    try { await LedgerModel.updateOne({}, { $set: { amount: 99999 } }); }
    catch (e) { updateBlocked = true; }
    check("updateOne blocked by Mongoose pre-hook", updateBlocked);

    let deletedBlocked = false;
    try { await LedgerModel.deleteOne({}); }
    catch (e) { deletedBlocked = true; }
    check("deleteOne blocked by Mongoose pre-hook", deletedBlocked);

    let updateManyBlocked = false;
    try { await LedgerModel.updateMany({}, { $set: { amount: 1 } }); }
    catch (e) { updateManyBlocked = true; }
    check("updateMany blocked by Mongoose pre-hook", updateManyBlocked);

    let deleteManyBlocked = false;
    try { await LedgerModel.deleteMany({}); }
    catch (e) { deleteManyBlocked = true; }
    check("deleteMany blocked by Mongoose pre-hook", deleteManyBlocked);

    await mongoose.disconnect();
  }

  // ─── 14. LOGOUT & BLACKLIST ───────────────────────
  section("14. AUTH — LOGOUT & TOKEN BLACKLIST");
  {
    const logout = await api("POST", "/api/auth/logout", null, TOKEN_B);
    check("Logout → 200", logout.status === 200, logout.status, 200);
    check("Logout message correct", logout.data.message?.includes("logged out"), logout.data.message);

    const blacklisted = await api("GET", "/api/accounts/", null, TOKEN_B);
    check("Blacklisted token → 401", blacklisted.status === 401, blacklisted.status, 401);
    check("Blacklisted message correct",
      blacklisted.data.message?.toLowerCase().includes("unauthorized"), blacklisted.data.message);

    const noToken = await api("POST", "/api/auth/logout");
    check("Logout with no token → 200 (graceful)", noToken.status === 200, noToken.status, 200);
  }

  // ─── 15. GLOBAL ERROR HANDLER ─────────────────────
  section("15. GLOBAL ERROR HANDLER");
  {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "BAD_JSON"
    });
    const text = await r.text();
    check("Malformed JSON — no HTML in response", !text.includes("<html>"), text.slice(0, 80));
    check("Malformed JSON — no stack trace exposed", !text.includes("at Object."), text.slice(0, 80));
  }

  // ─── 16. SOURCE CODE VERIFICATION ────────────────
  section("16. SOURCE CODE — All Fixes Verified");
  {
    const appJs   = fs.readFileSync(require("path").join(PROJECT_ROOT, "backend/src/app.js"), "utf8");
    const authCtl = fs.readFileSync(require("path").join(PROJECT_ROOT, "backend/src/controllers/auth.controller.js"), "utf8");
    const txnCtl  = fs.readFileSync(require("path").join(PROJECT_ROOT, "backend/src/controllers/transaction.controller.js"), "utf8");
    const viteCfg = fs.readFileSync(require("path").join(PROJECT_ROOT, "frontend/vite.config.js"), "utf8");
    const authCtx = fs.readFileSync(require("path").join(PROJECT_ROOT, "frontend/src/context/AuthContext.jsx"), "utf8");

    check("app.js: cors() middleware present", appJs.includes("cors("));
    check("app.js: rate limiter present", appJs.includes("rateLimit"));
    check("app.js: rate limiter applied to /api/auth",
      appJs.includes("authLimiter") && appJs.includes("authRouter"));
    check("app.js: global error handler (4-arg) present",
      appJs.includes("err, req, res, next"));

    check("auth.controller: cookie has httpOnly:true",
      authCtl.includes("httpOnly: true"));
    check("auth.controller: cookie has sameSite",
      authCtl.includes("sameSite"));
    check("auth.controller: cookie has maxAge",
      authCtl.includes("maxAge"));

    check("transaction.controller: fromAccount checks ownership (user: req.user._id)",
      txnCtl.includes("user: req.user._id"));
    check("transaction.controller: session abortTransaction() on error",
      txnCtl.includes("abortTransaction()"));
    check("transaction.controller: session endSession() on error",
      (txnCtl.match(/endSession/g) || []).length >= 2);
    check("transaction.controller: NO artificial 15s delay",
      !txnCtl.includes("15 * 1000") && !txnCtl.includes("15000"));
    check("transaction.controller: createInitialFundsTransaction has try/catch",
      txnCtl.split("createInitialFundsTransaction")[1]?.includes("try {"));
    check("transaction.controller: FAILED/REVERSED idempotency uses 400 not 500",
      txnCtl.includes('status(400)') &&
      /status\(400\)[^}]+FAILED|FAILED[^}]+status\(400\)/.test(txnCtl.replace(/\n/g, ' ')));

    check("vite.config: proxy /api → localhost:3000",
      viteCfg.includes("'/api'") && viteCfg.includes("localhost:3000"));
    check("AuthContext: reads from localStorage on mount",
      authCtx.includes("localStorage.getItem"));
    check("AuthContext: writes to localStorage on login/register",
      authCtx.includes("localStorage.setItem"));
    check("AuthContext: removes from localStorage on logout",
      authCtx.includes("localStorage.removeItem"));
  }

  // ─── 17. FRONTEND BUILD ───────────────────────────
  section("17. FRONTEND BUILD");
  {
    try {
      const out = execSync("npm run build", {
        cwd: require("path").join(PROJECT_ROOT, "frontend"), stdio: "pipe"
      }).toString();
      check("Vite build completes successfully", out.includes("built in") || out.includes("kB"));
    } catch (e) {
      fail("Vite build failed", e.stderr?.toString().slice(0, 200));
    }
  }

  // ─── 6. RATE LIMITING (moved to end so it doesn't exhaust quota for other auth tests) ──────
  section("6. RATE LIMITING (20 req / 15 min per IP)");
  {
    console.log("  Sending 22 rapid login attempts to trigger rate limiter...");
    let hit429 = false;
    for (let i = 0; i < 22; i++) {
      const r = await api("POST", "/api/auth/login", { email: "x@x.com", password: "x" });
      if (r.status === 429) { hit429 = true; break; }
    }
    check("Rate limiter fires 429 after 20 requests", hit429);
    console.log("  (runs last to avoid quota exhaustion for other tests)");
  }

  // ─── RESULTS ──────────────────────────────────────
  const total = PASS + FAIL;
  console.log("\n\x1b[1m═══════════════════════════════════════════════════\x1b[0m");
  if (FAIL === 0) {
    console.log(`\x1b[32m\x1b[1m  🎉 ALL ${total} TESTS PASSED  ✅\x1b[0m`);
  } else {
    console.log(`  \x1b[32m\x1b[1m${PASS} passed\x1b[0m  |  \x1b[31m\x1b[1m${FAIL} failed\x1b[0m  |  ${total} total`);
  }
  console.log("\x1b[1m═══════════════════════════════════════════════════\x1b[0m\n");
  process.exit(FAIL > 0 ? 1 : 0);

})().catch(e => { console.error("Test suite crashed:", e); process.exit(1); });
