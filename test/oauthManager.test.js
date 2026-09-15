import assert from 'node:assert/strict';
import test from 'node:test';
import { oauthManager } from '../src/oauthManager.js';

test('OAuth state is valid once for the matching redirect URI', () => {
  const auth = oauthManager.getAuthUrl(8045);
  assert.equal(oauthManager.consumeState(auth.state, auth.redirectUri), true);
  assert.equal(oauthManager.consumeState(auth.state, auth.redirectUri), false);
});

test('OAuth state cannot be consumed for another redirect URI', () => {
  const auth = oauthManager.getAuthUrl(8045);
  assert.equal(oauthManager.consumeState(auth.state, 'http://localhost:9999/oauth-callback'), false);
});
