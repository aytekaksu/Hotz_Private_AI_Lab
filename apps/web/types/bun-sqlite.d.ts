declare module 'bun:sqlite' {
  interface RunResult {
    changes: number;
    lastInsertRowid: number;
  }

  interface Statement<T = unknown> {
    all(...params: any[]): T[];
    get(...params: any[]): T;
    run(...params: any[]): RunResult;
  }

  export class Database {
    constructor(filename: string, options?: any);
    exec(sql: string): void;
    prepare<T = unknown>(sql: string): Statement<T>;
    close(): void;
  }
}

