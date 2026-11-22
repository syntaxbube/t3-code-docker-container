import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const welcomePage = readFileSync(new URL('../container/welcome.html', import.meta.url), 'utf8');

test('approved setup submits passwords only to the pairing endpoint and exposes real navigation', () => {
  assert.match(welcomePage, /<form method="post" action="\/umbrel\/pair">/);
  assert.match(welcomePage, /href="\/umbrel\/connect"/);
  assert.match(welcomePage, /class="text-button" href="\/"/);
  assert.doesNotMatch(welcomePage, /<script>|Mockup only|Preview only|class="feedback"/);
  assert.match(welcomePage, /name="password"/);
  assert.match(welcomePage, /Set up T3 Connect/);
  assert.match(welcomePage, /Not your Umbrel login\./);
});
