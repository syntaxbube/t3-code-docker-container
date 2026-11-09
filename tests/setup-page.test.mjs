import { test } from 'node:test';
import assert from 'node:assert/strict';
import { welcomePage } from '../container/welcome.mjs';

test('approved setup submits passwords only to the pairing endpoint and exposes real navigation', () => {
  assert.match(welcomePage, /<form method="post" action="\/umbrel\/pair">/);
  assert.match(welcomePage, /href="\/umbrel\/connect"/);
  assert.match(welcomePage, /class="text-button" href="\/"/);
  assert.doesNotMatch(welcomePage, /<script>|Mockup only|Preview only|class="feedback"/);
  assert.match(welcomePage, /class="[^"]*setup-dot-pattern/);
});
