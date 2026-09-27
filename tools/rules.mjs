// SPDX-License-Identifier: GPL-3.0-or-later
export function splitRule(line) {
  const fields = [];
  let start = 0;
  let quote = '';
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\') { i++; continue; }
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { fields.push(line.slice(start, i).trim()); start = i + 1; }
  }
  if (quote || depth !== 0) throw new Error('Unbalanced rule syntax');
  fields.push(line.slice(start).trim());
  return fields;
}

export function parseRule(line) {
  const clean = line.replace(/\s+\/\/.*$/, '').trim();
  const fields = splitRule(clean);
  const terminal = ['FINAL', 'MATCH'].includes(fields[0]);
  const policyIndex = terminal ? 1 : 2;
  if (!fields[policyIndex]) throw new Error('Missing rule policy');
  return {type: fields[0], value: terminal ? '' : fields[1], policy: fields[policyIndex],
    options: fields.slice(policyIndex + 1), original: clean,
    entry: [...fields.slice(0, policyIndex), ...fields.slice(policyIndex + 1)].join(',')};
}

export function partition(rules) {
  const domains = [];
  const entries = [];
  for (const rule of rules) {
    if (['DOMAIN', 'DOMAIN-SUFFIX'].includes(rule.type) && !rule.options.length) {
      domains.push((rule.type === 'DOMAIN-SUFFIX' ? '.' : '') + rule.value);
    } else entries.push(rule.entry);
  }
  return {domains: [...new Set(domains)], entries: [...new Set(entries)]};
}

export function policyRuns(rules) {
  const runs = [];
  for (const rule of rules) {
    if (runs.at(-1)?.policy !== rule.policy) runs.push({policy: rule.policy, rules: []});
    runs.at(-1).rules.push(rule);
  }
  return runs;
}

export function sections(text) {
  const result = {};
  let key;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\[([^\]]+)\]$/);
    if (match) {
      key = match[1];
      if (result[key]) throw new Error('Duplicate section: ' + key);
      result[key] = [];
    } else if (key) result[key].push(line);
  }
  return result;
}

export const active = lines => (lines || []).map(x => x.trim()).filter(x => x && !/^(#|;|\/\/)/.test(x));
export const serialize = data => Object.entries(data).map(([key, lines]) => `[${key}]\n${lines.join('\n').trim()}\n`).join('\n');
