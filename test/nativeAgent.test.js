import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanToolCallText,
  buildNativeTurn,
  detectMode,
  extractLocalFileReferences,
  extractToolCalls
} from '../src/nativeAgent.js';

const tools = [{
  type: 'function',
  function: {
    name: 'read_file',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path']
    }
  }
}];

test('extractToolCalls parses OpenAI-style calls', () => {
  const calls = extractToolCalls(
    '{"tool_calls":[{"name":"read_file","arguments":{"path":"README.md"}}]}',
    [],
    tools
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].function.name, 'read_file');
  assert.equal(JSON.parse(calls[0].function.arguments).path, 'README.md');
});

test('extractToolCalls repairs common missing-comma model output', () => {
  const calls = extractToolCalls(
    '{"tool_calls":[{"name":"read_file" "arguments":{"path":"package.json"}}]}',
    [],
    tools
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].function.name, 'read_file');
  assert.equal(JSON.parse(calls[0].function.arguments).path, 'package.json');
});

test('planner-native calls are converted only to tools Cursor exposed', () => {
  const calls = extractToolCalls('', [{
    name: 'Read',
    argumentsJson: '{"path":"/Users/alice/project/debug.log"}'
  }], tools);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].function.name, 'read_file');
  assert.equal(JSON.parse(calls[0].function.arguments).path, '/Users/alice/project/debug.log');

  const unavailable = extractToolCalls('', [{
    name: 'browser_open',
    argumentsJson: '{"url":"https://example.com"}'
  }], tools);
  assert.equal(unavailable, null);
});

test('remote internal paths are dropped instead of guessed as local actions', () => {
  const calls = extractToolCalls('', [{
    name: 'Read',
    argumentsJson: '{"path":"/home/vps/.gemini/antigravity-ide/transcript.jsonl"}'
  }], tools);

  assert.equal(calls, null);
});

test('cleanToolCallText removes machine payloads from visible assistant text', () => {
  const raw = 'I will inspect it.\n```json\n{"tool_calls":[{"name":"read_file","arguments":{"path":"README.md"}}]}\n```';
  assert.equal(cleanToolCallText(raw), 'I will inspect it.');
});

test('detectMode chooses agent mode when Cursor supplies tools', () => {
  assert.equal(detectMode({ messages: [{ role: 'user', content: 'Fix the bug' }], tools }), 'agent');
});

test('agent prompt makes Cursor the only workspace tool executor', () => {
  const turn = buildNativeTurn({
    messages: [{ role: 'user', content: 'Read /Users/alice/project/debug.log and fix the issue' }],
    tools
  });

  assert.match(turn.messageToSend, /Cursor is the sole orchestrator and tool executor/);
  assert.match(turn.messageToSend, /\/Users\/alice\/project\/debug\.log/);
  assert.match(turn.messageToSend, /Never resolve or read them on the server/);
  assert.doesNotMatch(turn.messageToSend, /\[Project: Antigravity on Cursor\]/);
});

test('extractLocalFileReferences recognizes paths carried by attachment parts', () => {
  const refs = extractLocalFileReferences([{
    role: 'user',
    content: [
      { type: 'text', text: 'Please inspect this log' },
      { type: 'image_url', image_url: { url: 'file:///Users/alice/project/error.log' } }
    ]
  }]);

  assert.deepEqual(refs, ['file:///Users/alice/project/error.log']);
});
