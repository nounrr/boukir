export interface UploadPdfOptions {
  token?: string;
  bonId?: string | number;
  bonType?: string;
}

export interface UploadPdfResponse {
  url: string;
  absoluteUrl: string;
  fileName: string;
}

/**
 * Upload a PDF file to the backend storage and return its public URLs.
 */
export async function uploadBonPdf(file: Blob, filename: string, options: UploadPdfOptions = {}): Promise<UploadPdfResponse> {
  const formData = new FormData();
  formData.append('pdf', file, filename);

  const params = new URLSearchParams();
  if (options.bonId != null) params.set('bonId', String(options.bonId));
  if (options.bonType) params.set('bonType', options.bonType);

  const query = params.toString();
  const endpoint = query ? `/api/uploads/pdf?${query}` : '/api/uploads/pdf';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Upload PDF failed');
  }

  const payload = await res.json();
  return payload as UploadPdfResponse;
}
