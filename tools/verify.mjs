import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {active, sections, splitRule} from './rules.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'Surge/manifest.json'), 'utf8'));
for (const set of manifest.sets) {
  const entries = active(fs.readFileSync(path.join(repo, set.file), 'utf8').split('\n'));
  assert.equal(entries.length, set.count);
  assert.equal(new Set(entries).size, entries.length);
  for (const line of entries) {
    if (set.type === 'DOMAIN-SET') assert(/^\.?[a-zA-Z0-9_.-]+$/.test(line));
    else {
      const parts = splitRule(line);
      assert(!['FINAL', 'RULE-SET', 'DOMAIN-SET'].includes(parts[0]));
      assert(!parts.some(x => ['DIRECT', 'PROXY', 'REJECT', 'REJECT-DROP'].includes(x)), 'Policy leaked into a RULE-SET entry');
    }
  }
}
for (const name of ['weibo', 'blockAds']) {
  const text = fs.readFileSync(path.join(repo, `Surge/module/${name}.sgmodule`), 'utf8');
  const data = sections(text);
  assert(!/http-response-jq|ca-p12\s*=|ca-passphrase\s*=|\{\{\{/.test(text));
  const names = active(data.Script).map(line => line.split(/\s*=\s*type=/)[0]);
  assert.equal(new Set(names).size, names.length);
  for (const line of active(data.Rule)) {
    const [type, url] = splitRule(line);
    assert(['DOMAIN-SET', 'RULE-SET'].includes(type));
    const prefix = 'https://raw.githubusercontent.com/iceloon/wall/main/';
    assert(url.startsWith(prefix));
    assert(fs.existsSync(path.join(repo, url.slice(prefix.length))));
  }
  for (const line of active(data['Body Rewrite'])) {
    assert(/^http-response \S+ '[^']*' '[^']*'$/.test(line), 'Body replacement operands must be quoted');
  }
}
console.log(`Verified ${manifest.sets.length} public sets and both modules.`);
