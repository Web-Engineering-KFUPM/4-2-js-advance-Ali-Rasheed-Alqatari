#!/usr/bin/env node
/**
 * Lab 4.2 JS Advance — Autograder (grade.cjs)
 *
 * Scoring:
 * - TODO 1..6: 11 marks each (66 total)
 * - TODO 7: 14 marks (14 total)
 * - Tasks total: 80
 * - Submission: 20 (on-time=20, late=10, missing/empty JS=0)
 * - Total: 100
 *
 * Due date: 09/17/2025 11:59 PM Riyadh (UTC+03:00)
 *
 * IMPORTANT (late check):
 * - We grade lateness using the latest *student-work* commit:
 *   - Excludes bot/workflow commits by author/message signals
 *   - Excludes commits that ONLY modify autograder/workflow files (even if authored by an instructor)
 *
 * Status codes:
 * - 0 = on time
 * - 1 = late
 * - 2 = no submission OR empty JS file
 *
 * Outputs:
 * - artifacts/grade.csv  (structure unchanged)
 * - artifacts/feedback/README.md
 * - GitHub Actions Step Summary (GITHUB_STEP_SUMMARY)
 *
 * NOTE: In your workflow, make sure checkout uses full history:
 *   uses: actions/checkout@v4
 *   with: { fetch-depth: 0 }
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const LAB_NAME = "4.2 JS Advance";

const ARTIFACTS_DIR = "artifacts";
const FEEDBACK_DIR = path.join(ARTIFACTS_DIR, "feedback");
fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

/** Due date: 09/17/2025 11:59 PM Riyadh (UTC+03:00) */
const DUE_ISO = "2025-09-17T23:59:00+03:00";
const DUE_EPOCH_MS = Date.parse(DUE_ISO);

/** ---------- Student ID ---------- */
function getStudentId() {
  const repoFull = process.env.GITHUB_REPOSITORY || ""; // org/repo
  const repoName = repoFull.includes("/") ? repoFull.split("/")[1] : repoFull;
  const fromRepoSuffix =
    repoName && repoName.includes("-")
      ? repoName.split("-").slice(-1)[0]
      : "";
  return (
    process.env.STUDENT_USERNAME ||
    fromRepoSuffix ||
    process.env.GITHUB_ACTOR ||
    repoName ||
    "student"
  );
}

/** ---------- Git helpers: latest *student-work* commit time ---------- */
const BOT_SIGNALS = [
  "[bot]",
  "github-actions",
  "actions@github.com",
  "github classroom",
  "classroom[bot]",
  "dependabot",
  "autograding",
  "workflow",
  "grader",
  "autograder",
];

const IGNORED_FILE_PREFIXES = [
  ".github/workflows/",
  "artifacts/",
  "node_modules/",
];

const IGNORED_FILES_EXACT = new Set([
  "grade.cjs",
  "package.json",
  "package-lock.json",
  "grade.yml",
  ".gitignore",
]);

function looksLikeBotCommit(hayLower) {
  return BOT_SIGNALS.some((s) => hayLower.includes(s));
}

function isIgnoredPath(p) {
  if (!p) return true;
  if (IGNORED_FILES_EXACT.has(p)) return true;
  return IGNORED_FILE_PREFIXES.some((pre) => p.startsWith(pre));
}

function getChangedFilesForCommit(sha) {
  try {
    const out = execSync(`git diff-tree --no-commit-id --name-only -r ${sha}`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (!out) return [];
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getHeadCommitInfo() {
  try {
    const out = execSync("git log -1 --format=%H|%ct|%an|%ae|%s", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();

    if (!out) return null;

    const [sha, ct, an, ae, ...subjParts] = out.split("|");
    const seconds = Number(ct);
    const epochMs = Number.isFinite(seconds) ? seconds * 1000 : null;

    return {
      sha: sha || "unknown",
      epochMs,
      iso: epochMs ? new Date(epochMs).toISOString() : "unknown",
      author: an || "unknown",
      email: ae || "unknown",
      subject: subjParts.join("|") || "",
    };
  } catch {
    return null;
  }
}

function getLatestStudentWorkCommitInfo() {
  // Returns: { epochMs, iso, sha, author, email, subject, note }
  try {
    const out = execSync("git log --format=%H|%ct|%an|%ae|%s -n 800", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();

    if (!out) {
      return {
        epochMs: null,
        iso: "unknown",
        sha: "unknown",
        author: "unknown",
        email: "unknown",
        subject: "",
        note: "git log returned no commits",
      };
    }

    const lines = out.split("\n");
    for (const line of lines) {
      const parts = line.split("|");
      const sha = parts[0] || "";
      const ct = parts[1] || "";
      const an = parts[2] || "";
      const ae = parts[3] || "";
      const subject = parts.slice(4).join("|") || "";

      const hay = `${an} ${ae} ${subject}`.toLowerCase();
      if (looksLikeBotCommit(hay)) continue;

      // Exclude commits that ONLY touch autograder/workflow infra
      const changed = getChangedFilesForCommit(sha);
      if (changed.length > 0) {
        const hasStudentWorkChange = changed.some((f) => !isIgnoredPath(f));
        if (!hasStudentWorkChange) continue;
      }

      const seconds = Number(ct);
      if (!Number.isFinite(seconds)) continue;

      const epochMs = seconds * 1000;
      return {
        epochMs,
        iso: new Date(epochMs).toISOString(),
        sha: sha || "unknown",
        author: an || "unknown",
        email: ae || "unknown",
        subject,
        note: "selected latest non-bot commit that changes student work (ignores grader-only commits)",
      };
    }

    // Fallback to HEAD (best effort)
    const head = getHeadCommitInfo();
    return {
      epochMs: head ? head.epochMs : null,
      iso: head ? head.iso : "unknown",
      sha: head ? head.sha : "unknown",
      author: head ? head.author : "unknown",
      email: head ? head.email : "unknown",
      subject: head ? head.subject : "",
      note: "fallback to HEAD (no student-work commit detected)",
    };
  } catch (e) {
    return {
      epochMs: null,
      iso: "unknown",
      sha: "unknown",
      author: "unknown",
      email: "unknown",
      subject: "",
      note: `git inspection failed: ${String(e)}`,
    };
  }
}

function wasSubmittedLate(commitEpochMs) {
  if (!commitEpochMs) return false; // best-effort: don't penalize on unknown
  return commitEpochMs > DUE_EPOCH_MS;
}

/** ---------- File discovery: pick student's JS file ---------- */
function readTextSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}
function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}
function findScriptSrcs(html) {
  const h = stripHtmlComments(html);
  const re =
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script\s*>/gi;
  const srcs = [];
  let m;
  while ((m = re.exec(h)) !== null) srcs.push(m[1]);
  return srcs;
}
function resolveFromIndex(src, indexPath) {
  const base = path.dirname(indexPath);
  if (/^https?:\/\//i.test(src)) return null;
  const cleaned = src.replace(/^\//, "");
  return path.normalize(path.join(base, cleaned));
}

function guessJsFileFromRepo() {
  const indexPath = "index.html";
  if (fs.existsSync(indexPath)) {
    const html = readTextSafe(indexPath);
    const srcs = findScriptSrcs(html);
    for (const src of srcs) {
      const resolved = resolveFromIndex(src, indexPath);
      if (
        resolved &&
        fs.existsSync(resolved) &&
        fs.statSync(resolved).isFile() &&
        resolved.toLowerCase().endsWith(".js")
      ) {
        return resolved;
      }
    }
  }

  const candidates = ["script.js", "app.js", "main.js", "index.js"];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }

  const entries = fs.readdirSync(".", { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    const name = e.name;
    if (!name.toLowerCase().endsWith(".js")) continue;
    if (name === "grade.cjs") continue;
    if (name.toLowerCase().endsWith(".cjs")) continue;
    return name;
  }
  return null;
}

/** ---------- JS parsing helpers ---------- */
function stripJsComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}
function compactWs(s) {
  return s.replace(/\s+/g, " ").trim();
}
function isEmptyCode(code) {
  const stripped = compactWs(stripJsComments(code));
  return stripped.length < 10;
}

/** ---------- VM helpers (DO NOT crash on SyntaxError) ---------- */
function canCompileInVm(studentCode) {
  try {
    new vm.Script(`(function(){ ${studentCode} })();`);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: String(e && e.stack ? e.stack : e) };
  }
}
function runInSandbox(studentCode, { postlude = "" } = {}) {
  const logs = [];
  const context = {
    console: {
      log: (...args) => logs.push(args.map((a) => String(a)).join(" ")),
      warn: (...args) => logs.push(args.map((a) => String(a)).join(" ")),
      error: (...args) => logs.push(args.map((a) => String(a)).join(" ")),
    },
    globalThis: {},
    __RUNTIME_ERROR__: null,
    __EXPORTED__: null,
  };
  context.globalThis = context;

  const wrapped = `
    (function(){
      "use strict";
      try {
        ${studentCode}
        ${postlude}
      } catch (e) {
        globalThis.__RUNTIME_ERROR__ = (e && e.stack) ? String(e.stack) : String(e);
      }
    })();
  `;

  try {
    const script = new vm.Script(wrapped);
    const ctx = vm.createContext(context);
    script.runInContext(ctx, { timeout: 800 });
  } catch (e) {
    context.__RUNTIME_ERROR__ = String(e && e.stack ? e.stack : e);
  }

  return {
    logs,
    runtimeError: context.__RUNTIME_ERROR__ || null,
    exported: context.__EXPORTED__ || null,
  };
}

/** ---------- Requirement scoring ---------- */
function scoreFromRequirements(reqs, maxMarks) {
  const total = reqs.length;
  const ok = reqs.filter((r) => r.ok).length;
  if (total === 0) return { earned: 0, ok, total };
  return { earned: Math.round((maxMarks * ok) / total), ok, total };
}
function req(label, ok, detailIfFail = "") {
  return { label, ok: !!ok, detailIfFail };
}
function formatReqs(reqs) {
  const lines = [];
  for (const r of reqs) {
    if (r.ok) lines.push(`- ✅ ${r.label}`);
    else lines.push(`- ❌ ${r.label}${r.detailIfFail ? ` — ${r.detailIfFail}` : ""}`);
  }
  return lines;
}

/** ---------- Locate submission ---------- */
const studentId = getStudentId();
const jsPath = guessJsFileFromRepo();
const hasJs = !!(jsPath && fs.existsSync(jsPath));
const jsCode = hasJs ? readTextSafe(jsPath) : "";
const jsEmpty = hasJs ? isEmptyCode(jsCode) : true;

const jsNote = hasJs
  ? jsEmpty
    ? `⚠️ Found \`${jsPath}\` but it appears empty (or only comments).`
    : `✅ Found \`${jsPath}\`.`
  : "❌ No student JS file found in repository root (or index.html link).";

/** ---------- Submission time + status ---------- */
const commitInfo = getLatestStudentWorkCommitInfo();
const headInfo = getHeadCommitInfo();

const late = hasJs && !jsEmpty ? wasSubmittedLate(commitInfo.epochMs) : false;

let status = 0;
if (!hasJs || jsEmpty) status = 2;
else status = late ? 1 : 0;

const submissionMarks = status === 2 ? 0 : status === 1 ? 10 : 20;

const submissionStatusText =
  status === 2
    ? "No submission detected (missing/empty JS): submission marks = 0/20."
    : status === 1
      ? `Late submission via latest *student-work* commit: 10/20. (commit: ${commitInfo.sha} @ ${commitInfo.iso})`
      : `On-time submission via latest *student-work* commit: 20/20. (commit: ${commitInfo.sha} @ ${commitInfo.iso})`;

/** ---------- Static analysis base ---------- */
const cleanedCode = stripJsComments(jsCode);

/** ---------- Optional dynamic run (only if compiles) ---------- */
let runGeneral = null;
let compileError = null;

if (hasJs && !jsEmpty) {
  const cc = canCompileInVm(jsCode);
  if (!cc.ok) compileError = cc.error;
  else runGeneral = runInSandbox(jsCode);
}

function logsContain(logs, re) {
  if (!logs) return false;
  return logs.some((l) => re.test(l));
}

/** ---------- Flexible detectors ---------- */
function anyOfRegexes(code, regexes) {
  return regexes.some((re) => re.test(code));
}
function hasRangeValidationForGpa(code) {
  return anyOfRegexes(code, [
    /\b(gpa|newGpa|value)\s*>=\s*0(\.0+)?\s*&&\s*(gpa|newGpa|value)\s*<=\s*4(\.0+)?/i,
    /\b(gpa|newGpa|value)\s*<\s*0(\.0+)?\s*\|\|\s*(gpa|newGpa|value)\s*>\s*4(\.0+)?/i,
    /\bMath\.max\s*\(\s*0(\.0+)?\s*,\s*Math\.min\s*\(\s*4(\.0+)?\s*,/i,
    /\bthrow\b[\s\S]{0,80}\b(gpa|newGpa)\b/i,
  ]);
}

/** ---------- Tasks (TODO 1..7) ---------- */
const tasks = [
  {
    id: "TODO 1",
    name: "Object with Getters & Setters (Student: fullName + GPA validation)",
    marks: 11,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      const hasStudentish =
        /\b(firstName|firstname)\b/.test(code) &&
        /\b(lastName|lastname)\b/.test(code) &&
        /\bgpa\b/.test(code);

      const hasGetter =
        /\bget\s+fullName\s*\(/.test(code) ||
        /\bfullName\s*:\s*function\s*\(/.test(code) ||
        /\bfullName\s*\(\)\s*\{/.test(code);

      const hasSetterOrUpdater =
        /\bset\s+gpa\s*\(/.test(code) ||
        /\bupdateGpa\s*\(/i.test(code) ||
        /\bsetGpa\s*\(/i.test(code);

      const hasValidation = hasRangeValidationForGpa(code);

      const usesFullName = /fullName\b/.test(code) && /console\.log\s*\(/.test(code);
      const logsStudentAttrs =
        /console\.log\s*\([\s\S]*\b(firstName|lastName|gpa|fullName)\b/i.test(code) ||
        (runGeneral && logsContain(runGeneral.logs, /gpa|fullname|first/i));

      reqs.push(req("Defines a Student-like object/class with firstName, lastName, gpa", hasStudentish));
      reqs.push(req('Implements fullName getter/method returning "firstName lastName"', hasGetter));
      reqs.push(req("Has a GPA updater (setter or updateGpa method)", hasSetterOrUpdater));
      reqs.push(req("Validates GPA range 0.0–4.0", hasValidation));
      reqs.push(req("Creates an instance and outputs attributes (including via fullName)", usesFullName || logsStudentAttrs));

      return reqs;
    },
  },
  {
    id: "TODO 2",
    name: "Object as Map + for...in loop",
    marks: 11,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      const hasMapObject =
        /\b(const|let|var)\s+\w+\s*=\s*\{[\s\S]*?:[\s\S]*?\}/.test(code);

      const hasForIn =
        /\bfor\s*\(\s*(const|let|var)?\s*\w+\s+in\s+\w+\s*\)/.test(code);

      const logsKeyValue =
        /console\.log\s*\([\s\S]*\+\s*[\s\S]*\)/.test(code) ||
        /console\.log\s*\(\s*\w+\s*,\s*\w+\s*\[\s*\w+\s*\]\s*\)/.test(code) ||
        /console\.log\s*\(\s*`\$\{\w+\}[\s\S]*\$\{\w+\[\w+\]\}.*`\s*\)/.test(code);

      reqs.push(req("Creates an object used as a key→value map", hasMapObject));
      reqs.push(req("Iterates over the map using for...in", hasForIn));
      reqs.push(req("Displays key and value during iteration", logsKeyValue || (runGeneral && logsContain(runGeneral.logs, /:/))));

      return reqs;
    },
  },
  {
    id: "TODO 3",
    name: "String — charAt() & length",
    marks: 11,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      const hasString =
        /\b(new\s+String\s*\(|["'`][\s\S]*?["'`])/.test(code);
      const usesCharAt = /\.charAt\s*\(\s*(\d+|\w+)\s*\)/.test(code);
      const usesLength = /\.length\b/.test(code);

      const outputs =
        /console\.log\s*\([\s\S]*(charAt|length)[\s\S]*\)/i.test(code) ||
        (runGeneral && logsContain(runGeneral.logs, /\b\d+\b/));

      reqs.push(req("Creates a string (plain or new String)", hasString));
      reqs.push(req("Uses .charAt(index)", usesCharAt));
      reqs.push(req("Uses .length", usesLength));
      reqs.push(req("Outputs char(s) and length", outputs));

      return reqs;
    },
  },
  {
    id: "TODO 4",
    name: "Date — day, month, year",
    marks: 11,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      const hasNow = /\bnew\s+Date\s*\(\s*\)/.test(code) || /\bnew\s+Date\b/.test(code);
      const hasGetDate = /\.getDate\s*\(\s*\)/.test(code);
      const hasGetMonth = /\.getMonth\s*\(\s*\)/.test(code);
      const hasGetFullYear = /\.getFullYear\s*\(\s*\)/.test(code);

      const outputs =
        /console\.log\s*\([\s\S]*get(Date|Month|FullYear)/.test(code) ||
        (runGeneral && logsContain(runGeneral.logs, /\b20\d{2}\b/));

      reqs.push(req("Creates a Date for current moment (new Date())", hasNow));
      reqs.push(req("Uses getDate()", hasGetDate));
      reqs.push(req("Uses getMonth()", hasGetMonth));
      reqs.push(req("Uses getFullYear()", hasGetFullYear));
      reqs.push(req("Displays the day/month/year values", outputs));

      return reqs;
    },
  },
  {
    id: "TODO 5",
    name: "Array + Spread — min and max from 10 numbers",
    marks: 11,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      const hasArrayLiteral10 =
        /\[\s*[-]?\d+(\.\d+)?\s*(,\s*[-]?\d+(\.\d+)?\s*){9,}\]/.test(code);

      const hasMinSpread =
        /Math\.min\s*\(\s*\.\.\.\s*\w+/.test(code) ||
        /Math\.min\s*\(\s*\.\.\.\s*\[/.test(code);

      const hasMaxSpread =
        /Math\.max\s*\(\s*\.\.\.\s*\w+/.test(code) ||
        /Math\.max\s*\(\s*\.\.\.\s*\[/.test(code);

      const logsMinMax =
        /console\.log\s*\([\s\S]*Math\.(min|max)/.test(code) ||
        (runGeneral && logsContain(runGeneral.logs, /min|max/i));

      reqs.push(req("Declares an array with (about) 10 numbers", hasArrayLiteral10 || /\bArray\s*\(\s*10\s*\)/.test(code) || /\bpush\s*\(/.test(code)));
      reqs.push(req("Uses spread with Math.min(...)", hasMinSpread));
      reqs.push(req("Uses spread with Math.max(...)", hasMaxSpread));
      reqs.push(req("Displays min and max", logsMinMax));

      return reqs;
    },
  },
  {
    id: "TODO 6",
    name: "Exceptions — try/catch/finally with empty array edge case",
    marks: 11,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      const hasTryCatchFinally =
        /\btry\s*\{[\s\S]*\}\s*catch\s*\(\s*\w+\s*\)\s*\{[\s\S]*\}\s*finally\s*\{[\s\S]*\}/.test(code);

      const hasMaxFunction =
        /\bfunction\s+\w+\s*\(\s*\w+\s*\)\s*\{[\s\S]*return[\s\S]*\}/.test(code) &&
        /\b(Math\.max|reduce|for\s*\(|while\s*\(|if\s*\()/i.test(code);

      const checksEmpty =
        /if\s*\(\s*\w+\.length\s*===\s*0\s*\)\s*\{[\s\S]*throw/i.test(code) ||
        /if\s*\(\s*!\s*\w+\.length\s*\)\s*\{[\s\S]*throw/i.test(code) ||
        /throw\s+new\s+Error/i.test(code);

      const passesEmptyArray =
        /\(\s*\[\s*\]\s*\)/.test(code) || /\b\w+\s*=\s*\[\s*\]\s*;/.test(code);

      const logsFlow =
        /console\.log\s*\([\s\S]*(try|catch|finally)[\s\S]*\)/i.test(code) ||
        (runGeneral && logsContain(runGeneral.logs, /try|catch|finally/i));

      reqs.push(req("Uses try/catch/finally blocks", hasTryCatchFinally));
      reqs.push(req("Implements a function to return max element", hasMaxFunction));
      reqs.push(req("Handles empty array case by throwing/triggering an error", checksEmpty));
      reqs.push(req("Intentionally passes an empty array to trigger error", passesEmptyArray));
      reqs.push(req("Logs messages in try, catch, and finally", logsFlow));

      return reqs;
    },
  },
  {
    id: "TODO 7",
    name: "Regex + forEach — find words containing 'ab'",
    marks: 14,
    requirements: () => {
      const code = cleanedCode;
      const reqs = [];

      const hasWords =
        /\bwords\s*=\s*\[\s*["']ban["']\s*,\s*["']babble["']\s*,\s*["']make["']\s*,\s*["']flab["']\s*\]/i.test(code) ||
        /\bconst\s+words\s*=\s*\[/.test(code);

      const hasRegex =
        /\/ab\/[gimsuy]*/.test(code) ||
        /new\s+RegExp\s*\(\s*["']ab["']/.test(code);

      const usesForEach = /\.forEach\s*\(\s*\(?\s*\w+/.test(code);
      const usesTest = /\.test\s*\(\s*\w+\s*\)/.test(code);

      const logsMatches =
        /matches!\s*["'`]/.test(code) ||
        /console\.log\s*\(\s*["'`][\s\S]*matches!/i.test(code) ||
        (runGeneral && logsContain(runGeneral.logs, /matches!/i));

      reqs.push(req("Defines the words list (or equivalent)", hasWords));
      reqs.push(req("Creates a RegExp to detect 'ab' substring", hasRegex));
      reqs.push(req("Loops with forEach()", usesForEach));
      reqs.push(req("Uses pattern.test(word) (or equivalent) to check matches", usesTest));
      reqs.push(req('Logs "<word> matches!" for matches', logsMatches));

      return reqs;
    },
  },
];

/** ---------- Grade tasks ---------- */
let earnedTasks = 0;

const taskResults = tasks.map((t) => {
  const reqs =
    status === 2
      ? [req("No submission / empty JS → cannot grade tasks", false)]
      : t.requirements();

  const { earned } = scoreFromRequirements(reqs, t.marks);
  const earnedSafe = status === 2 ? 0 : earned;
  earnedTasks += earnedSafe;

  return { id: t.id, name: t.name, earned: earnedSafe, max: t.marks, reqs };
});

const totalEarned = Math.min(earnedTasks + submissionMarks, 100);

/** ---------- Build Summary ---------- */
const now = new Date().toISOString();

let summary = `# Lab | ${LAB_NAME} | Autograding Summary

- Student: \`${studentId}\`
- ${jsNote}
- ${submissionStatusText}
- Due (Riyadh): \`${DUE_ISO}\`

- Repo HEAD commit:
  - SHA: \`${headInfo ? headInfo.sha : "unknown"}\`
  - Author: \`${headInfo ? headInfo.author : "unknown"}\` <${headInfo ? headInfo.email : "unknown"}>
  - Time (UTC ISO): \`${headInfo ? headInfo.iso : "unknown"}\`

- Chosen commit for submission timing:
  - SHA: \`${commitInfo.sha}\`
  - Author: \`${commitInfo.author}\` <${commitInfo.email}>
  - Time (UTC ISO): \`${commitInfo.iso}\`
  - Note: ${commitInfo.note}

- Status: **${status}** (0=on time, 1=late, 2=no submission/empty)
- Run: \`${now}\`

## Marks Breakdown

| Item | Marks |
|------|------:|
`;

for (const tr of taskResults) {
  summary += `| ${tr.id}: ${tr.name} | ${tr.earned}/${tr.max} |\n`;
}
summary += `| Submission | ${submissionMarks}/20 |\n`;

summary += `
## Total Marks

**${totalEarned} / 100**

## Detailed Feedback
`;

for (const tr of taskResults) {
  summary += `\n### ${tr.id}: ${tr.name}\n`;
  summary += formatReqs(tr.reqs).join("\n") + "\n";
}

if (compileError) {
  summary += `\n---\n⚠️ **SyntaxError: code could not compile.** Dynamic checks were skipped; grading used static checks only.\n\n\`\`\`\n${compileError}\n\`\`\`\n`;
} else if (runGeneral && runGeneral.runtimeError) {
  summary += `\n---\n⚠️ **Runtime error detected (best-effort captured):**\n\n\`\`\`\n${runGeneral.runtimeError}\n\`\`\`\n`;
}

/** ---------- Write outputs ---------- */
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

/** DO NOT change CSV structure */
const csv = `student_username,obtained_marks,total_marks,status
${studentId},${totalEarned},100,${status}
`;

fs.writeFileSync(path.join(ARTIFACTS_DIR, "grade.csv"), csv);
fs.writeFileSync(path.join(FEEDBACK_DIR, "README.md"), summary);

console.log(`✔ Lab graded: ${totalEarned}/100 (status=${status})`);
