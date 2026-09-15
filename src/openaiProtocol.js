export function normalizeCompletionResult(result) {
  if (!result || typeof result !== 'object') {
    return { fullText: '', usage: null, toolCalls: null };
  }
  return {
    fullText: typeof result.fullText === 'string' ? result.fullText : '',
    usage: result.usage || null,
    toolCalls: Array.isArray(result.toolCalls) ? result.toolCalls : null
  };
}

export function resolveStreamError(error, abortSource, signalReason) {
  if (abortSource === 'client') return null;
  if (abortSource === 'timeout' && signalReason instanceof Error) return signalReason;
  return error instanceof Error ? error : new Error(String(error || 'Completion failed'));
}
