export type UploadProgressOptions = {
  onProgress?: (percent: number | null, loaded: number, total: number) => void;
  signal?: AbortSignal;
};

// Browser-only helper to POST multipart uploads with progress reporting.
export function uploadWithProgress<T = any>(
  url: string,
  formData: FormData,
  options: UploadProgressOptions = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'json';

    const { onProgress, signal } = options;
    let aborted = false;
    const abortHandler = () => {
      aborted = true;
      xhr.abort();
      reject(new DOMException('Upload aborted', 'AbortError'));
    };

    if (signal) {
      if (signal.aborted) {
        return abortHandler();
      }
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(percent, event.loaded, event.total);
      } else {
        onProgress(null, event.loaded, event.total);
      }
    };

    xhr.onerror = () => {
      if (aborted) return;
      reject(new Error('Network error while uploading'));
    };

    xhr.onload = () => {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      if (aborted) return;
      const responseData = xhr.response ?? safeParse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(responseData as T);
        return;
      }
      const message =
        (responseData as any)?.error || `Upload failed (${xhr.status || 'unknown status'})`;
      reject(new Error(message));
    };

    xhr.send(formData);
  });
}

const safeParse = (value: any) => {
  try {
    return typeof value === 'string' && value ? JSON.parse(value) : value;
  } catch {
    return value;
  }
};
