export function isBunRuntime(): boolean {
  return typeof Bun !== 'undefined';
}

export function assertBunRuntime(context: string): void {
  if (!isBunRuntime()) {
    const hint = context ? ` (${context})` : '';
    throw new Error(
      `Bun runtime required${hint}. Start the server with ` +
        "`bun run dev` or `bun run start` so 'bun:sqlite' and Bun.file APIs are available."
    );
  }
}
