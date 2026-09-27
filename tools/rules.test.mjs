import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRule, partition, policyRuns} from './rules.mjs';

test('logical rules and quoted URL quantifiers retain nested commas', () => {
  assert.equal(parseRule('AND,((DOMAIN,a.test),(NOT,((DOMAIN,b.test)))),REJECT').entry,
    'AND,((DOMAIN,a.test),(NOT,((DOMAIN,b.test))))');
  assert.equal(parseRule('URL-REGEX,"^https://x\\.test/[0-9]{1,3}",REJECT-DROP').policy, 'REJECT-DROP');
  assert.equal(parseRule('URL-REGEX,^https://x\\.test/[0-9]{1,3},REJECT').entry,
    'URL-REGEX,^https://x\\.test/[0-9]{1,3}');
});

test('CIDR options survive removal of the policy', () => {
  assert.equal(parseRule('IP-CIDR,192.0.2.0/24,REJECT,no-resolve').entry,
    'IP-CIDR,192.0.2.0/24,no-resolve');
});

test('exact domains, suffixes and domain flags remain distinct', () => {
  assert.deepEqual(partition([
    'DOMAIN,a.test,REJECT', 'DOMAIN-SUFFIX,a.test,REJECT',
    'DOMAIN,b.test,REJECT,extended-matching', 'DOMAIN-KEYWORD,ads,REJECT'
  ].map(parseRule)), {domains: ['a.test', '.a.test'], entries: ['DOMAIN,b.test,extended-matching', 'DOMAIN-KEYWORD,ads']});
});

test('separated policies are not merged across precedence boundaries', () => {
  const runs = policyRuns(['DOMAIN,a.test,DIRECT', 'DOMAIN-SUFFIX,test,REJECT', 'DOMAIN,b.test,DIRECT'].map(parseRule));
  assert.deepEqual(runs.map(x => x.policy), ['DIRECT', 'REJECT', 'DIRECT']);
});

test('private process names with spaces and final policies parse unchanged', () => {
  assert.equal(parseRule('PROCESS-NAME,Codex (Service),Auto').value, 'Codex (Service)');
  assert.equal(parseRule('FINAL,DIRECT').policy, 'DIRECT');
});
