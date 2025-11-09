import { NextRequest } from 'next/server';
import {
  saveGoogleOAuthConfig,
  deleteGoogleOAuthConfig,
  getGoogleOAuthConfigWithMeta,
  getGoogleOAuthConfigSummary,
  GoogleOAuthConfig,
  GoogleOAuthConfigSummary,
} from '@/lib/db';
import { ApiError, route } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const coerceSummary = (summary: GoogleOAuthConfigSummary) => ({
  configured: summary.configured,
  source: summary.source,
  clientIdSuffix: summary.clientId ? summary.clientId.slice(-8) : null,
  projectId: summary.projectId ?? null,
  updatedAt: summary.updatedAt ?? null,
  redirectUriCount: summary.redirectUriCount ?? 0,
  canDelete: summary.canDelete ?? false,
});

const sanitizeString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const filtered = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
  return filtered.length > 0 ? filtered : [];
};

function extractGoogleClientConfig(json: any): GoogleOAuthConfig {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid Google client secret JSON payload.');
  }

  const container =
    (typeof json.installed === 'object' && json.installed !== null && json.installed) ||
    (typeof json.web === 'object' && json.web !== null && json.web) ||
    json;

  const clientId = sanitizeString((container as any).client_id ?? (container as any).clientId);
  const clientSecret = sanitizeString((container as any).client_secret ?? (container as any).clientSecret);

  if (!clientId || !clientSecret) {
    throw new Error('The uploaded JSON does not contain a client_id and client_secret pair.');
  }

  return {
    clientId,
    clientSecret,
    projectId: sanitizeString((container as any).project_id),
    authUri: sanitizeString((container as any).auth_uri),
    tokenUri: sanitizeString((container as any).token_uri),
    authProviderCertUrl: sanitizeString((container as any).auth_provider_x509_cert_url),
    redirectUris: asStringArray((container as any).redirect_uris),
    javascriptOrigins: asStringArray((container as any).javascript_origins),
  };
}

export const GET = route(async () => coerceSummary(await getGoogleOAuthConfigSummary()));

const isFileLike = (value: FormDataEntryValue | null): value is Blob => {
  if (!value || typeof value !== 'object') return false;
  if (typeof File !== 'undefined' && value instanceof File) {
    return true;
  }
  return typeof (value as Blob).arrayBuffer === 'function' && typeof (value as Blob).text === 'function';
};

export const POST = route(async (req: NextRequest) => {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    throw new ApiError(400, 'Expected multipart/form-data request with JSON file');
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!isFileLike(file)) {
    throw new ApiError(400, 'Missing JSON file input named "file"');
  }

  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'Uploaded file is not valid JSON');
  }

  const config = extractGoogleClientConfig(parsed);
  await saveGoogleOAuthConfig(config);
  return { success: true, ...coerceSummary(await getGoogleOAuthConfigSummary()) };
});

export const DELETE = route(async () => {
  const stored = await getGoogleOAuthConfigWithMeta();
  if (!stored) {
    throw new ApiError(409, 'Google OAuth client is configured via environment variables or not set');
  }
  deleteGoogleOAuthConfig();
  return { success: true, ...coerceSummary(await getGoogleOAuthConfigSummary()) };
});
