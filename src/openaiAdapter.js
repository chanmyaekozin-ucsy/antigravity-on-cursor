import { antigravity, MODEL_MAP } from './antigravityClient.js';
import { accountManager } from './accountManager.js';
import crypto from 'crypto';

export async function handleModels(req, res) {
  try {
    if (req.headers.authorization) {
      accountManager.validateKey(req.headers.authorization);
    }
    const models = await antigravity.getModels();
    const data = models.map(m => ({
      id: m.id,
      object: 'model',
      created: 1726300000,
      owned_by: 'antigravity',
      name: m.name,
      category: m.category,
      description: m.description,
      isRecommended: m.isRecommended,
      quotaInfo: m.quotaInfo
    }));

    res.json({
      object: 'list',
      data
    });
  } catch (err) {
    res.status(500).json({
      error: {
        message: err.message,
        type: 'internal_error'
      }
    });
  }
}

export async function handleChatCompletions(req, res) {
  const authCheck = accountManager.validateKey(req.headers.authorization);
  if (!authCheck.valid) {
    return res.status(401).json({
      error: {
        message: 'Invalid API key. Please generate a valid key from the Antigravity Dashboard at http://localhost:8045.',
        type: 'invalid_request_error',
        code: 'invalid_api_key'
      }
    });
  }

  const {
    model,
    messages,
    stream = true,
    tools = [],
    tool_choice = 'auto',
    conversation_id = null,
    user = null
  } = req.body;

  const conversationId = conversation_id
    || req.headers['x-cursor-conversation-id']
    || req.headers['x-conversation-id']
    || null;

  // ── Verbose request log ──────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[Request] ${new Date().toISOString()}`);
  console.log(`[Request] Model      : ${model || '(none — will default)'}`);
  console.log(`[Request] Stream     : ${stream}`);
  console.log(`[Request] Messages   : ${(messages || []).length}`);
  console.log(`[Request] Tools      : ${(tools || []).length ? tools.map(t => t.function?.name || t.name).join(', ') : 'none'}`);
  console.log(`[Request] ToolChoice : ${typeof tool_choice === 'object' ? JSON.stringify(tool_choice) : tool_choice}`);
  console.log(`[Request] ConvoId    : ${conversationId || '(fingerprint from messages)'}`);
  (messages || []).forEach((m, i) => {
    let content = '';
    if (typeof m.content === 'string') content = m.content;
    else if (m.content == null && m.tool_calls) content = `[tool_calls x${m.tool_calls.length}]`;
    else if (m.content != null) content = JSON.stringify(m.content);
    else content = '';
    console.log(`[Request]   [${i}] ${m.role}: ${content.slice(0, 120)}${content.length > 120 ? '…' : ''}`);
  });
  console.log(`${'─'.repeat(60)}`);
  // ────────────────────────────────────────────────────────────────

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: {
        message: 'Missing or invalid "messages" parameter',
        type: 'invalid_request_error'
      }
    });
  }

  const completionId = `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
  const createdTimestamp = Math.floor(Date.now() / 1000);
  const targetModel = model || 'dominate-gemini-3.8-flash-high';

  // Abort controller only if client closes connection prematurely
  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  if (stream) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // 1. Initial assistant role chunk
    const initialChunk = {
      id: completionId,
      object: 'chat.completion.chunk',
      created: createdTimestamp,
      model: targetModel,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant' },
          finish_reason: null
        }
      ]
    };
    res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);

    let lastTokenTime = Date.now();
    let streamedContentLen = 0;

    const emitDelta = (text, type = 'content') => {
      if (!text || res.writableEnded || abortController.signal.aborted) return;
      lastTokenTime = Date.now();
      if (type === 'content') {
        streamedContentLen += text.length;
      }
      const chunk = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: createdTimestamp,
        model: targetModel,
        choices: [
          {
            index: 0,
            delta: type === 'reasoning'
              ? { reasoning_content: text, reasoning: text }
              : { content: text },
            finish_reason: null
          }
        ]
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    };

    // Active token watchdog: if no content/reasoning tokens have been sent for 2500ms,
    // emit a standard empty delta chunk. This resets Cursor's client-side inactivity timer
    // without altering message content or finish reason.
    const keepAlive = setInterval(() => {
      if (res.writableEnded || abortController.signal.aborted) return;
      const now = Date.now();
      if (now - lastTokenTime >= 2500) {
        lastTokenTime = now;
        const pingChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: createdTimestamp,
          model: targetModel,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: null
            }
          ]
        };
        res.write(`data: ${JSON.stringify(pingChunk)}\n\n`);
      } else {
        res.write(': keepalive\n\n');
      }
    }, 1000);

    const cleanup = () => clearInterval(keepAlive);

    abortController.signal.addEventListener('abort', () => {
      cleanup();
    });

    try {
      await antigravity.generateCompletion({
        modelId: targetModel,
        messages,
        tools,
        tool_choice,
        conversationId,
        headers: req.headers,
        accountId: req.headers['x-account-id'] || authCheck.accountId,
        signal: abortController.signal,
        onDelta: (deltaPayload) => {
          if (!deltaPayload || res.writableEnded || abortController.signal.aborted) return;
          lastTokenTime = Date.now();
          if (typeof deltaPayload === 'string') {
            process.stdout.write('·');
            emitDelta(deltaPayload, 'content');
          } else if (deltaPayload.thinking) {
            process.stdout.write('💭');
            emitDelta(deltaPayload.thinking, 'reasoning');
          } else if (deltaPayload.content) {
            process.stdout.write('·');
            emitDelta(deltaPayload.content, 'content');
          }
        },
        onDone: ({ fullText = '', usage, toolCalls }) => {
          cleanup();
          if (res.writableEnded) return;

          if (toolCalls && toolCalls.length > 0) {
            console.log(`\n[Response] 🛠️ Tool calls (${toolCalls.length}): ${toolCalls.map(c => c.function?.name || c.name).join(', ')} — tokens: in=${usage?.inputTokens ?? '?'} out=${usage?.outputTokens ?? '?'}`);
            console.log(`${'═'.repeat(60)}\n`);

            for (let idx = 0; idx < toolCalls.length; idx++) {
              const tc = toolCalls[idx];
              const callId = tc.id || `call_${idx}_${crypto.randomBytes(4).toString('hex')}`;
              const fnName = tc.function?.name || tc.name;
              const argsStr = typeof tc.function?.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function?.arguments || tc.arguments || {});

              // 1. Initial tool call header chunk
              const startChunk = {
                id: completionId,
                object: 'chat.completion.chunk',
                created: createdTimestamp,
                model: targetModel,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: idx,
                          id: callId,
                          type: 'function',
                          function: {
                            name: fnName,
                            arguments: ''
                          }
                        }
                      ]
                    },
                    finish_reason: null
                  }
                ]
              };
              res.write(`data: ${JSON.stringify(startChunk)}\n\n`);

              // 2. Stream argument slices
              const SLICE_SIZE = 128;
              for (let j = 0; j < argsStr.length; j += SLICE_SIZE) {
                const slice = argsStr.substring(j, j + SLICE_SIZE);
                const argChunk = {
                  id: completionId,
                  object: 'chat.completion.chunk',
                  created: createdTimestamp,
                  model: targetModel,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index: idx,
                            function: {
                              arguments: slice
                            }
                          }
                        ]
                      },
                      finish_reason: null
                    }
                  ]
                };
                res.write(`data: ${JSON.stringify(argChunk)}\n\n`);
              }
            }

            // 3. Final chunk with finish_reason: 'tool_calls'
            const finishChunk = {
              id: completionId,
              object: 'chat.completion.chunk',
              created: createdTimestamp,
              model: targetModel,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: 'tool_calls'
                }
              ],
              usage: usage ? {
                prompt_tokens: parseInt(usage.inputTokens || 0, 10),
                completion_tokens: parseInt(usage.outputTokens || 0, 10),
                total_tokens: parseInt(usage.inputTokens || 0, 10) + parseInt(usage.outputTokens || 0, 10)
              } : undefined
            };
            res.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
          } else {
            // Flush any remaining unstreamed visible content
            if (typeof fullText === 'string' && streamedContentLen < fullText.length) {
              const missing = fullText.slice(streamedContentLen);
              if (missing) {
                emitDelta(missing, 'content');
              }
            }

            console.log(`\n[Response] ✅ Done — ${fullText.length} chars, tokens: in=${usage?.inputTokens ?? '?'} out=${usage?.outputTokens ?? '?'}`);
            console.log(`${'═'.repeat(60)}\n`);

            const finalChunk = {
              id: completionId,
              object: 'chat.completion.chunk',
              created: createdTimestamp,
              model: targetModel,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: 'stop'
                }
              ],
              usage: usage ? {
                prompt_tokens: parseInt(usage.inputTokens || 0, 10),
                completion_tokens: parseInt(usage.outputTokens || 0, 10),
                total_tokens: parseInt(usage.inputTokens || 0, 10) + parseInt(usage.outputTokens || 0, 10)
              } : undefined
            };
            res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
          }

          res.write('data: [DONE]\n\n');
          res.end();
        },
        onError: (err) => {
          cleanup();
          if (res.writableEnded || abortController.signal.aborted) {
            console.log('[OpenAIAdapter] Request ended (client disconnected).');
            return;
          }
          console.error('[OpenAIAdapter] Completion stream error:', err.message);
          const errChunk = {
            error: {
              message: err.message,
              type: 'antigravity_error'
            }
          };
          res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      });
    } catch (err) {
      cleanup();
      if (!res.writableEnded) {
        console.error('[OpenAIAdapter] Error starting completion:', err.message);
        res.write(`data: ${JSON.stringify({ error: { message: err.message } })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  } else {
    // Non-streaming mode
    try {
      let accumulated = '';
      let completionUsage = null;
      let resultToolCalls = null;

      await antigravity.generateCompletion({
        modelId: targetModel,
        messages,
        tools,
        tool_choice,
        conversationId,
        headers: req.headers,
        accountId: req.headers['x-account-id'] || authCheck.accountId,
        signal: abortController.signal,
        onDelta: (delta) => {
          if (typeof delta === 'string') accumulated += delta;
          else if (delta?.content) accumulated += delta.content;
        },
        onDone: ({ fullText, usage, toolCalls }) => {
          accumulated = fullText;
          completionUsage = usage;
          resultToolCalls = toolCalls;
        },
        onError: (err) => {
          throw err;
        }
      });

      const messageObj = {
        role: 'assistant',
        content: accumulated || null
      };

      if (resultToolCalls && resultToolCalls.length > 0) {
        messageObj.tool_calls = resultToolCalls.map((tc, idx) => ({
          id: tc.id || `call_${idx}_${crypto.randomBytes(4).toString('hex')}`,
          type: 'function',
          function: {
            name: tc.function?.name || tc.name,
            arguments: typeof tc.function?.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function?.arguments || tc.arguments || {})
          }
        }));
      }

      res.json({
        id: completionId,
        object: 'chat.completion',
        created: createdTimestamp,
        model: targetModel,
        choices: [
          {
            index: 0,
            message: messageObj,
            finish_reason: (resultToolCalls && resultToolCalls.length > 0) ? 'tool_calls' : 'stop'
          }
        ],
        usage: completionUsage ? {
          prompt_tokens: parseInt(completionUsage.inputTokens || 0, 10),
          completion_tokens: parseInt(completionUsage.outputTokens || 0, 10),
          total_tokens: parseInt(completionUsage.inputTokens || 0, 10) + parseInt(completionUsage.outputTokens || 0, 10)
        } : {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      });
    } catch (err) {
      res.status(500).json({
        error: {
          message: err.message,
          type: 'antigravity_error'
        }
      });
    }
  }
}
