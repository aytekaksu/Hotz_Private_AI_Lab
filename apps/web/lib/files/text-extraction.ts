const TEXT_STREAM_MIMETYPES = new Set(['application/json']);

export const shouldStreamTextContent = (mimetype: string) =>
  mimetype.startsWith('text/') || TEXT_STREAM_MIMETYPES.has(mimetype);

// Helper to extract text from binary formats that require parsing
export async function extractTextFromBytes(data: Uint8Array, mimetype: string): Promise<string | undefined> {
  try {
    if (mimetype === 'application/pdf') {
      try {
        const pdfParse = (await import('pdf-parse')).default as (data: Buffer) => Promise<{ text: string }>;
        const res = await pdfParse(Buffer.from(data));
        return res.text || undefined;
      } catch (e) {
        console.error('PDF parse failed:', e);
        return undefined;
      }
    }
    if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const mammoth = await import('mammoth');
        const res = await mammoth.extractRawText({ buffer: Buffer.from(data) });
        const text = typeof res?.value === 'string' ? res.value : undefined;
        return text;
      } catch (e) {
        console.error('DOCX parse failed:', e);
        return undefined;
      }
    }
    // For other file types, return undefined (could add PDF/DOCX parsers later)
    return undefined;
  } catch (error) {
    console.error('Error extracting text:', error);
    return undefined;
  }
}

export { TEXT_STREAM_MIMETYPES };
