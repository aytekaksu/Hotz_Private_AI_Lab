import { encode } from 'gpt-tokenizer';

export const MAX_ATTACHMENT_TOKENS = Number(process.env.MAX_ATTACHMENT_TOKENS || 100_000);

export function countTokens(text: string | null | undefined): number {
  if (!text || typeof text !== 'string' || text.length === 0) return 0;
  return encode(text).length;
}

export function formatTokenLimitError(fileName: string, tokens: number, limit = MAX_ATTACHMENT_TOKENS): string {
  const readableTokens = tokens.toLocaleString('en-US');
  const readableLimit = limit.toLocaleString('en-US');
  return `File "${fileName}" is too large to process (${readableTokens} tokens). The limit is ${readableLimit} tokens. Please trim or split the file before uploading.`;
}
