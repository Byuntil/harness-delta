#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

let root;
try {
  root = git("rev-parse", "--show-toplevel").trim();
} catch {
  console.error("Run this check inside the Git checkout.");
  process.exit(2);
}

const rel = file => relative(root, file).split(sep).join("/");
// Ignored files exist only on this machine, so a link to one is broken for every other reader.
const files = git("-C", root, "ls-files", "-co", "--exclude-standard", "-z")
  .split("\0").filter(Boolean).map(name => resolve(root, name)).filter(existsSync);
const known = new Set(files);
const markdown = files.filter(file => file.endsWith(".md"));
const scopes = process.argv.slice(2).map(arg => resolve(arg));
const inScope = file => scopes.length === 0 || scopes.some(scope => file === scope || file.startsWith(scope + sep));
const selected = markdown.filter(inScope);
// A mistyped path must not turn into a passing check of nothing.
for (const scope of scopes) {
  if (!markdown.some(file => file === scope || file.startsWith(scope + sep))) {
    console.error(`No Markdown file to check under ${rel(scope)}.`);
    process.exit(2);
  }
}

const parsed = new Map();
function parse(file) {
  let doc = parsed.get(file);
  if (doc) return doc;
  doc = { anchors: new Set(), links: [], blocks: [], levels: "" };
  parsed.set(file, doc);
  const slugCounts = new Map();
  let fence = null;
  readFileSync(file, "utf8").split(/\r?\n/).forEach((text, index) => {
    const line = index + 1;
    const mark = /^\s*(`{3,}|~{3,})/.exec(text)?.[1];
    if (fence) {
      if (mark && mark[0] === fence.mark[0] && mark.length >= fence.mark.length && text.trim() === mark) {
        doc.blocks.push(fence);
        fence = null;
      } else fence.body.push(text);
      return;
    }
    if (mark) {
      fence = { mark, line, body: [] };
      return;
    }
    const heading = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(text);
    if (heading) {
      doc.levels += heading[1].length;
      const slug = heading[2].replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/`/g, "").toLowerCase()
        .replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, "").replace(/ /g, "-");
      const seen = slugCounts.get(slug) ?? 0;
      slugCounts.set(slug, seen + 1);
      doc.anchors.add(seen === 0 ? slug : `${slug}-${seen}`);
    }
    for (const match of text.matchAll(/<[a-z][^>]*\s(?:id|name)="([^"]+)"/gi)) doc.anchors.add(match[1]);
    const prose = text.replace(/`[^`]*`/g, "");
    for (const match of prose.matchAll(/\]\(\s*<?([^)\s>]+)/g)) doc.links.push({ line, href: match[1] });
    const definition = /^ {0,3}\[(?!\^)[^\]]+\]:\s*<?([^\s>]+)/.exec(prose);
    if (definition) doc.links.push({ line, href: definition[1] });
  });
  if (fence) doc.blocks.push(fence);
  return doc;
}

const problems = [];
const notes = [];
let linkCount = 0;

for (const file of selected) {
  for (const { line, href } of parse(file).links) {
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) continue;
    linkCount++;
    const at = `${rel(file)}:${line}`;
    const hash = href.indexOf("#");
    let path = hash < 0 ? href : href.slice(0, hash);
    let anchor = hash < 0 ? "" : href.slice(hash + 1);
    try {
      path = decodeURIComponent(path);
      anchor = decodeURIComponent(anchor);
    } catch {
      problems.push(`${at} malformed link ${href}`);
      continue;
    }
    const target = path === "" ? file : path.startsWith("/") ? resolve(root, `.${path}`) : resolve(dirname(file), path);
    const targetName = rel(target);
    if (targetName === ".." || targetName.startsWith("../")) {
      problems.push(`${at} link leaves the repository: ${href}`);
      continue;
    }
    if (!existsSync(target)) {
      problems.push(`${at} missing target ${href}`);
      continue;
    }
    const isFile = statSync(target).isFile();
    if (isFile ? !known.has(target) : !files.some(name => name.startsWith(target + sep))) {
      problems.push(`${at} target is not a file Git lists (ignored, symlinked or wrong letter case): ${href}`);
      continue;
    }
    if (anchor && isFile && target.endsWith(".md") && !parse(target).anchors.has(anchor)) {
      problems.push(`${at} missing anchor ${href}`);
    }
    if (file.endsWith(".ko.md") && target.endsWith(".md") && !target.endsWith(".ko.md")) {
      const translated = target.replace(/\.md$/, ".ko.md");
      if (translated !== file && known.has(translated)) notes.push(`${at} links to ${targetName}; ${rel(translated)} exists`);
    }
  }
}

let pairCount = 0;
for (const korean of markdown.filter(file => file.endsWith(".ko.md"))) {
  const english = korean.replace(/\.ko\.md$/, ".md");
  if (!inScope(korean) && !inScope(english)) continue;
  if (!known.has(english)) {
    problems.push(`${rel(korean)} has no English counterpart`);
    continue;
  }
  pairCount++;
  const en = parse(english);
  const ko = parse(korean);
  if (en.levels !== ko.levels) problems.push(`${rel(korean)} heading structure differs from ${rel(english)}`);
  if (en.blocks.length !== ko.blocks.length) {
    problems.push(`${rel(korean)} has ${ko.blocks.length} fenced blocks; ${rel(english)} has ${en.blocks.length}`);
    continue;
  }
  en.blocks.forEach((block, index) => {
    const other = ko.blocks[index];
    if (block.body.join("\n") !== other.body.join("\n")) {
      problems.push(`${rel(korean)}:${other.line} fenced block differs from ${rel(english)}:${block.line}`);
    }
  });
}

for (const note of notes) console.log(`NOTE ${note}`);
for (const problem of problems) console.error(`PROBLEM ${problem}`);
console.log(`Checked ${selected.length} Markdown files, ${linkCount} local links, ${pairCount} bilingual pairs: ` +
  `${problems.length} problems, ${notes.length} notes.`);
process.exitCode = problems.length > 0 ? 1 : 0;
