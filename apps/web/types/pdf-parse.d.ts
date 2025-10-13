declare module 'pdf-parse' {
  export interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
    text: string;
  }

  function pdfParse(data: ArrayBuffer | Buffer, options?: unknown): Promise<PDFParseResult>;

  export = pdfParse;
}
