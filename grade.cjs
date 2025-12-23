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
 * - We grade lateness using the latest *student* commit (non-bot),
 *   NOT the latest workflow/GitHub Actions commit.
 * - We also include commit SHA + author/email in the feedback.
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

/** Due date: 09/17/2025 11:59 PM Riyadh time (UTC+03:00) */
const DUE_ISO = "2025-09-17T23:59:00+03:00";
const DUE_EPOCH_MS = Date.parse(DUE_ISO);

/** ---------- Student ID ---------- */
function getStudentId() {
  const repoFull = process.env.GITHUB_REPOSITORY || ""; // org/repo
  const repoName = repoFull.includes("/") ? repoFull.split("/")[1] : repoFull;

  // Classroom repos often end with username
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

/** ---------- Git helpers: latest *student* commit time (exclude bots/workflows) ---------- */
const BOT_SIGNALS = [
  "[bot]",
  "github-actions",
  "actions@github.com",
  "github classroom",
  "classroom[bot]",
  "dependabot",
  "autograding",
  "workflow",
];

function looksLikeBotCommit(hayLower) {
  return BOT_SIGNALS.some((s) => hayLower.includes(s));
}

function getLatestStudentCommitInfo() {
  // Returns: { epochMs, iso, sha, author, email, subject, usedFallback, note }
  try {
    // Ensure we have enough history; if checkout is shallow, this may still be limited,
    // but workflow should set fetch-depth: 0.
    const out = execSync(
      'git log --format=%H|%ct|%an|%ae|%s -n 500',
      { stdio: ["ignore", "pipe", "ignore"] }
    )
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
        usedFallback: true,
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
        usedFallback: false,
        note: "selected latest non-bot commit",
      };
    }

    // Fallback: latest commit if all appear bot-like
    const fb = execSync('git log -1 --format=%H|%ct|%an|%ae|%s', {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();

    if (!fb) {
      return {
        epochMs: null,
        iso: "unknown",
        sha: "unknown",
        author: "unknown",
        email: "unknown",
        subject: "",
        usedFallback: true,
        note: "fallback git log empty",
      };
    }

    const p = fb.split("|");
    const sha = p[0] || "unknown";
    const seconds = Number(p[1]);
    const epochMs = Number.isFinite(seconds) ? seconds * 1000 : null;

    return {
      epochMs,
      iso: epochMs ? new Date(epochMs).toISOString() : "unknown",
      sha,
      author: p[2] || "unknown",
      email: p[3] || "unknown",
      subject: p.slice(4).join("|") || "",
      usedFallback: true,
      note: "all commits looked bot-like; using latest commit as fallback",
    };
  } catch (e) {
    return {
      epochMs: null,
      iso: "unknown",
      sha: "unknown",
      author: "unknown",
      email: "unknown",
      subject: "",
      usedFallback: true,
      note: `git inspection failed: ${String(e)}`,
    };
  }
}

function wasSubmittedLate(commitEpochMs) {
  // If we cannot determine commit time, be conservative:
  // treat as late ONLY if there is a submission; otherwise status=2 handles missing.
  if (!commitEpochMs) return true;
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
  // prefer linked script if index.html exists
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

  // common names
  const candidates = ["script.js", "app.js", "main.js", "index.js"];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }

  // any .js in root excluding grader files and node_modules/artifacts
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

/** ---------- JS parsing helpers (lightweight / flexible heuristics) ---------- */
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
    return {
      ok: false,
      error: String(e && e.stack ? e.stack : e),
    };
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
    else
      lines.push(
        `- ❌ ${r.label}${r.detailIfFail ? ` — ${r.detailIfFail}` : ""}`
      );
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
const commitInfo = getLatestStudentCommitInfo();
const late = (!hasJs || jsEmpty) ? false : wasSubmittedLate(commitInfo.epochMs);

let status = 0;
if (!hasJs || jsEmpty) status = 2;
else status = late ? 1 : 0;

const submissionMarks = status === 2 ? 0 : status === 1 ? 10 : 20;

const submissionStatusText =
  status === 2
    ? "No submission detected (missing/empty JS): submission marks = 0/20."
    : status === 1
      ? `Late submission via latest *student* commit: 10/20. (commit: ${commitInfo.sha} @ ${commitInfo.iso})`
      : `On-time submission via latest *student* commit: 20/20. (commit: ${commitInfo.sha} @ ${commitInfo.iso})`;

/** ---------- Static analysis base ---------- */
const cleanedCode = stripJsComments(jsCode);

/** ---------- Optional dynamic run (only if compiles) ---------- */
let runGeneral = null;
let compileError = null;

if (hasJs && !jsEmpty) {
  const cc = canCompileInVm(jsCode);
  if (!cc.ok) {
    compileError = cc.error;
  } else {
    // Export nothing critical; dynamic output is just a bonus signal
    runGeneral = runInSandbox(jsCode);
  }
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
  // accepts patterns like:
  // newGpa >= 0 && newGpa <= 4
  // if (gpa < 0 || gpa > 4) throw ...
  // Math.max(0, Math.min(4, x))
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

      // student object could be: object literal, class, or function constructor
      const hasStudentish =
        /\b(firstName|firstname)\b/.test(code) &&
        /\b(lastName|lastname)\b/.test(code) &&
        /\bgpa\b/.test(code);

      const hasGetter =
        /\bget\s+fullName\s*\(/.test(code) || // class getter
        /\bfullName\s*:\s*function\s*\(/.test(code) || // method
        /\bfullName\s*\(\)\s*\{/.test(code); // shorthand method

      const hasSetterOrUpdater =
        /\bset\s+gpa\s*\(/.test(code) ||
        /\bupdateGpa\s*\(/i.test(code) ||
        /\bsetGpa\s*\(/i.test(code);

      const hasValidation = hasRangeValidationForGpa(code);

      const usesFullName =
        /fullName\b/.test(code) && /console\.log\s*\(/.test(code);
      const logsStudentAttrs =
        /console\.log\s*\([\s\S]*\b(firstName|lastName|gpa|fullName)\b/i.test(code) ||
        (runGeneral && logsContain(runGeneral.logs, /gpa|fullname|first/i));

      reqs.push(
        req(
          "Defines a Student-like object/class with firstName, lastName, gpa",
          hasStudentish,
          "Include firstName, lastName, and gpa fields."
        )
      );
      reqs.push(
        req(
          'Implements fullName getter/method returning "firstName lastName"',
          hasGetter,
          "Add a getter (get fullName()) or method fullName() that combines names."
        )
      );
      reqs.push(
        req(
          "Has a GPA updater (setter or updateGpa method)",
          hasSetterOrUpdater,
          "Add a setter for gpa or a method like updateGpa(newGpa)."
        )
      );
      reqs.push(
        req(
          "Validates GPA range 0.0–4.0",
          hasValidation,
          "Add checks for 0..4 (clamp or throw or conditional)."
        )
      );
      reqs.push(
        req(
          "Creates an instance and outputs attributes (including via fullName)",
          usesFullName || logsStudentAttrs,
          "Create an instance and console.log fields (use fullName)."
        )
      );

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
        /console\.log\s*\([\s\S]*\+\s*[\s\S]*\)/.test(code) || // concatenation
        /console\.log\s*\(\s*\w+\s*,\s*\w+\s*\[\s*\w+\s*\]\s*\)/.test(code) || // k, obj[k]
        /console\.log\s*\(\s*`\$\{\w+\}[\s\S]*\$\{\w+\[\w+\]\}.*`\s*\)/.test(code); // template literal

      reqs.push(req("Creates an object used as a key→value map", hasMapObject));
      reqs.push(req("Iterates over the map using for...in", hasForIn));
      reqs.push(
        req(
          "Displays key and value during iteration",
          logsKeyValue || (runGeneral && logsContain(runGeneral.logs, /:/)),
          "Log both the key and its value (e.g., key + value)."
        )
      );

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

      const usesCharAt = /\.charAt\s*\(\s*\d+/.test(code) || /\.charAt\s*\(\s*\w+/.test(code);
      const usesLength = /\.length\b/.test(code);

      const logsStringStuff =
        /console\.log\s*\([\s\S]*charAt|length[\s\S]*\)/i.test(code) ||
        (runGeneral && logsContain(runGeneral.logs, /\b\d+\b/));

      reqs.push(req("Creates a string (plain or new String)", hasString));
      reqs.push(req("Uses .charAt(index)", usesCharAt));
      reqs.push(req("Uses .length", usesLength));
      reqs.push(req("Outputs char(s) and length", logsStringStuff));

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

      // 10 numbers: accept explicit 10 values OR a populated array length >= 10
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

      reqs.push(
        req(
          "Declares an array with (about) 10 numbers",
          hasArrayLiteral10 || /\bArray\s*\(\s*10\s*\)/.test(code) || /\bpush\s*\(/.test(code),
          "Use an array with 10 numeric values (any values)."
        )
      );
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

  return {
    id: t.id,
    name: t.name,
    earned: earnedSafe,
    max: t.marks,
    reqs,
  };
});

const totalEarned = Math.min(earnedTasks + submissionMarks, 100);

/** ---------- Build Summary ---------- */
const now = new Date().toISOString();

let summary = `# Lab | ${LAB_NAME} | Autograding Summary

- Student: \`${studentId}\`
- ${jsNote}
- ${submissionStatusText}
- Due (Riyadh): \`${DUE_ISO}\`
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
