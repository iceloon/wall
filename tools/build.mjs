// SPDX-License-Identifier: GPL-3.0-or-later
// All private input/output paths are command arguments, never repository defaults.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {active, parseRule, partition, policyRuns, sections, serialize} from './rules.mjs';

const [baselinePath, profilePath, upstreamPath, compatPath, outputPath] = process.argv.slice(2);
assert(outputPath, 'Usage: node tools/build.mjs BASELINE CURRENT UPSTREAM COMPAT NEW_PROFILE');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert(!path.resolve(outputPath).startsWith(repo + path.sep), 'Private profile must stay outside Git');
assert(!fs.existsSync(outputPath), 'Refusing to overwrite an existing new profile');
const read = p => fs.readFileSync(p, 'utf8');
const oldText = read(baselinePath), currentText = read(profilePath);
const old = sections(oldText), current = sections(currentText);
const upstreamText = read(upstreamPath), compatText = read(compatPath);
const upstream = sections(upstreamText), compat = sections(compatText);
const rawBase = 'https://raw.githubusercontent.com/iceloon/wall/main';
const sourceDate = '2026-09-27';
const manifest = {sourceDate, repository: 'https://github.com/iceloon/wall', sets: []};
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function writePublic(relative, text) {
  // Public output is generated only from upstream rules or sanitized section allowlists.
  assert(!/ca-p12\s*=|ca-passphrase\s*=|password\s*=|username\s*=|policy-path\s*=|\/Users\//i.test(text), 'Private data in public output: ' + relative);
  const dest = path.join(repo, relative);
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.writeFileSync(dest, text);
}
function emitSets(label, rules, publicFiles = true, relativeRoot = '') {
  const {domains, entries} = partition(rules);
  const refs = [];
  const policy = rules[0].policy;
  assert(rules.every(r => r.policy === policy));
  // Group only adjacent rules with identical actions, preserving action precedence.
  for (const [type, content, folder, extension] of [
    ['DOMAIN-SET', domains, 'domain-set', 'domainset'],
    ['RULE-SET', entries, 'rule-set', 'list']
  ]) {
    if (!content.length) continue;
    const relative = publicFiles ? `Surge/${folder}/${label}.${extension}` : `${relativeRoot}/${label}.${extension}`;
    const text = `# ${label} | ${type} | ${sourceDate}\n# Policy supplied by the referring profile.\n${content.join('\n')}\n`;
    if (publicFiles) {
      writePublic(relative, text);
      manifest.sets.push({file: relative, type, policy, count: content.length});
    } else {
      const dest = path.join(path.dirname(outputPath), relative);
      fs.mkdirSync(path.dirname(dest), {recursive: true});
      fs.writeFileSync(dest, text, {mode: 0o600});
    }
    refs.push(`${type},${publicFiles ? rawBase + '/' + relative : relative},${policy}`);
  }
  const reconstructed = new Set([
    ...domains.map(d => `${d.startsWith('.') ? 'DOMAIN-SUFFIX' : 'DOMAIN'},${d.startsWith('.') ? d.slice(1) : d}`),
    ...entries
  ]);
  assert.deepEqual(reconstructed, new Set(rules.map(r => r.entry)), 'Rule semantics lost during extraction');
  return refs;
}

// The pre-blockAds profile starts with today's dedicated Weibo rules.
const baselineRules = active(old.Rule);
const boundary = baselineRules.findIndex(x => x.startsWith('DOMAIN-SET,'));
assert.equal(boundary, 32, 'Re-review the Weibo boundary if the baseline changes');
const weiboRules = baselineRules.slice(0, boundary).map(parseRule);
assert(weiboRules.every(r => r.policy === 'REJECT'));
const weiboRefs = emitSets('weibo', weiboRules);
const blockAdsRules = active(upstream.Rule).map(parseRule);
assert(blockAdsRules.every(r => ['REJECT', 'REJECT-DROP'].includes(r.policy)));
const blockRefs = policyRuns(blockAdsRules).flatMap((run, i) => emitSets(`blockAds-${String(i + 1).padStart(2, '0')}`, run.rules));

const weibo = {Rule: baselineRules.slice(0, boundary)};
for (const name of ['URL Rewrite', 'Map Local', 'Script']) weibo[name] = old[name];
weibo.MITM = old.MITM.filter(x => /^hostname\s*=/.test(x));
const weiboHosts = weibo.MITM[0].split('=')[1].trim();
writePublic('sources/weibo-576.snapshot.sgmodule', '# Snapshot from the existing Weibo configuration; credentials excluded.\n' + serialize(weibo));
writePublic('sources/blockAds-576.snapshot.sgmodule', compatText);
writePublic('sources/blockAds.upstream.sgmodule', upstreamText);
for (const [name, snapshot, refs] of [['weibo', weibo, weiboRefs], ['blockAds', compat, blockRefs]]) {
  const data = {Rule: refs};
  for (const key of ['Header Rewrite', 'URL Rewrite', 'Map Local', 'Body Rewrite', 'Script']) if (snapshot[key]) data[key] = snapshot[key];
  data.MITM = name === 'weibo' ? [`hostname = %APPEND% ${weiboHosts}`] : snapshot.MITM;
  writePublic(`Surge/module/${name}.sgmodule`, `#!name=wall ${name} (Surge 5.7.6)\n#!desc=Ruleset snapshot ${sourceDate}; see repository compatibility notes.\n#!author=fmz200 and original script authors; adapted by iceloon\n\n` + serialize(data));
}

// Keep personal routing outside the public repository. External sets stay intact.
const localRoot = path.basename(outputPath, '.conf') + '/routing';
const personalRefs = [];
let batch = [], localIndex = 0, privateSetCount = 0;
function flush() {
  if (!batch.length) return;
  if (batch.length < 3) personalRefs.push(...batch.map(r => r.original));
  else {
    const refs = emitSets(`routing-${String(++localIndex).padStart(3, '0')}`, batch, false, localRoot);
    privateSetCount += refs.length;
    personalRefs.push(...refs);
  }
  batch = [];
}
for (const line of baselineRules.slice(boundary)) {
  const rule = parseRule(line);
  if (['DOMAIN-SET', 'RULE-SET', 'FINAL', 'MATCH', 'GEOIP', 'PROCESS-NAME'].includes(rule.type)) {
    flush(); personalRefs.push(rule.original); continue;
  }
  if (batch.length && batch[0].policy !== rule.policy) flush();
  batch.push(rule);
}
flush();
const next = {...current, Rule: [
  '# Public blockAds policy runs; REJECT-DROP precedence retained.', ...blockRefs,
  '# Public Weibo rules.', ...weiboRefs,
  '# Personal routing; local companion files must travel with this profile.', ...personalRefs
]};
for (const key of Object.keys(current).filter(k => k !== 'Rule')) assert.deepEqual(next[key], current[key]);
const nextText = '# Prepared only; not activated. Keep the adjacent routing directory with this file.\n\n' + serialize(next);
fs.writeFileSync(outputPath, nextText, {mode: 0o600, flag: 'wx'});
assert.equal(read(profilePath), currentText, 'Active profile was changed');
manifest.inputs = {upstreamSha256: sha(upstreamText), compatibilitySha256: sha(compatText)};
manifest.weiboInputRules = weiboRules.length;
manifest.blockAdsInputRules = blockAdsRules.length;
manifest.publicRuleReferences = [...blockRefs, ...weiboRefs];
writePublic('Surge/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
// Public example deliberately contains no user's proxies, CA, or personal routing.
writePublic('Surge/Profiles/Wall.example.conf', '# Public example: routing filters only. Optional response modules are separate.\n\n' + serialize({
  General: ['loglevel = notify'],
  Rule: [...blockRefs, ...weiboRefs, 'FINAL,DIRECT']
}));
console.log(JSON.stringify({outputPath, privateSetCount, mainRuleLines: next.Rule.length,
  publicSets: manifest.sets, activeProfileUnchanged: true}, null, 2));
