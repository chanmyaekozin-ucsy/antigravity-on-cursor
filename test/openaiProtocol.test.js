import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCompletionResult, resolveStreamError } from '../src/openaiProtocol.js';

test('normalizeCompletionResult accepts the silent completion sentinel', () => {
  assert.deepEqual(normalizeCompletionResult(null), {
    fullText: '',
    usage: null,
    toolCalls: null
  });
});

test('normalizeCompletionResult preserves a normal completion', () => {
  const toolCalls = [{ id: 'call_1' }];
  assert.deepEqual(normalizeCompletionResult({ fullText: 'done', usage: { inputTokens: 1 }, toolCalls }), {
    fullText: 'done',
    usage: { inputTokens: 1 },
    toolCalls
  });
});

test('resolveStreamError ignores client disconnects but preserves server timeouts', () => {
  const timeout = new Error('Timed out waiting for model response.');
  assert.equal(resolveStreamError(new Error('aborted'), 'client'), null);
  assert.equal(resolveStreamError(new Error('aborted'), 'timeout', timeout), timeout);
});
