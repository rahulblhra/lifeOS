import type { Store } from '../types';

const APP_DATA_NAME = 'lifeos-data-v1.json';
const APP_DATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

type GoogleTokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type GIS = { accounts: { oauth2: { initTokenClient(options: { client_id: string; scope: string; callback: (response: GoogleTokenResponse) => void; error_callback?: (error: { type: string }) => void }): { requestAccessToken(options?: { prompt?: string }): void } } } };
declare global { interface Window { google?: GIS } }

let accessToken = '';
let expiresAt = 0;
let tokenClient: ReturnType<GIS['accounts']['oauth2']['initTokenClient']> | undefined;
let fileId: string | undefined;
let accountEmail = '';
let identityServicesPromise: Promise<void> | undefined;
export type DriveSnapshot = { data: Store; checkpoint: string };

export function driveIsConnected() { return Boolean(accessToken && Date.now() < expiresAt); }
export function getDriveAccountEmail() { return accountEmail; }

function loadIdentityServices(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (identityServicesPromise) return identityServicesPromise;
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.dataset.googleIdentity = 'true';
  identityServicesPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (error || !window.google?.accounts?.oauth2) {
        script.remove();
        identityServicesPromise = undefined;
        reject(error || new Error('Google sign-in loaded without its authorization API. Refresh and try again.'));
      } else resolve();
    };
    const timeout = window.setTimeout(() => finish(new Error('Google sign-in could not load from accounts.google.com. Check your internet connection, VPN, or content blocker, then retry.')), 15000);
    script.onload = () => finish();
    script.onerror = () => finish(new Error('Google sign-in could not load from accounts.google.com. Check your internet connection, VPN, or content blocker, then retry.'));
    document.head.append(script);
  });
  return identityServicesPromise;
}

// Start loading early so the OAuth popup can still be opened directly from the user's click.
void loadIdentityServices().catch(() => {});

export async function connectGoogleDrive(silent = false): Promise<void> {
  if (!CLIENT_ID) throw new Error('Google Drive is not configured yet. Add VITE_GOOGLE_CLIENT_ID to the local .env file and GitHub repository variables.');
  await loadIdentityServices();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google sign-in authorization is unavailable. Refresh the page and retry.');
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) { accessToken = ''; expiresAt = 0; reject(error); }
      else resolve();
    };
    const timeout = window.setTimeout(() => finish(new Error('Google authorization took too long. Try connecting again.')), 120000);
    tokenClient = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: APP_DATA_SCOPE,
      callback: async response => {
        if (!response.access_token) { finish(new Error(response.error_description || response.error || 'Google Drive access was not granted.')); return; }
        accessToken = response.access_token;
        expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
        try {
          const profile = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
          if (profile.ok) accountEmail = (await profile.json()).email || '';
        } catch { /* The Drive connection can still work if profile lookup is unavailable. */ }
        finish();
      },
      error_callback: error => finish(new Error(error.type === 'popup_failed_to_open' ? 'Google could not open the authorization window. Allow pop-ups and try again.' : error.type === 'popup_closed' ? 'Google authorization was closed before it finished.' : 'Google authorization was interrupted. Try again.')),
    });
    try { tokenClient.requestAccessToken({ prompt: silent ? 'none' : '' }); } catch { finish(new Error('Google authorization could not start. Try again.')); }
  });
}

export function disconnectGoogleDrive() { accessToken = ''; expiresAt = 0; fileId = undefined; accountEmail = ''; }

async function driveFetch(url: string, init: RequestInit = {}) {
  if (!driveIsConnected()) throw new Error('Your Google Drive session expired. Connect again to sync.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers });
  if (response.status === 401) { disconnectGoogleDrive(); throw new Error('Your Google Drive session expired. Connect again to sync.'); }
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.clone().json()).error?.message || ''; } catch { /* Keep the fallback below. */ }
    if (response.status === 403) throw new Error(detail ? `Google Drive denied access: ${detail}` : 'Google Drive denied access. Check that the Drive API is enabled and the OAuth app has Drive app data access.');
    throw new Error(detail ? `Google Drive error (${response.status}): ${detail}` : `Google Drive returned ${response.status}. Try syncing again.`);
  }
  return response;
}

export async function readDriveData(): Promise<DriveSnapshot | null> {
  const listUrl = new URL('https://www.googleapis.com/drive/v3/files');
  listUrl.searchParams.set('spaces', 'appDataFolder');
  listUrl.searchParams.set('q', `name = '${APP_DATA_NAME}' and trashed = false`);
  listUrl.searchParams.set('fields', 'files(id,name,modifiedTime)');
  const list = await driveFetch(listUrl.toString()).then(r => r.json()) as { files?: { id: string; modifiedTime?: string }[] };
  const file = list.files?.[0];
  fileId = file?.id;
  if (!fileId) return null;
  const backup = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`).then(r => r.json()) as any;
  if (backup?.app !== 'LifeOS' || backup?.formatVersion !== 1 || !backup?.data) throw new Error('The LifeOS file in this Drive app folder is invalid or uses an unsupported format.');
  const data = backup.data;
  const names = ['tasks','expenses','shoppingItems','learningGoals','learningTopics','reminders'];
  if (names.some(name => !Array.isArray(data[name]) || data[name].some((item: any) => !item || typeof item.id !== 'string'))) throw new Error('The LifeOS file in Drive is incomplete. Your local data was not changed.');
  if (data.stickyNotes !== undefined && (!Array.isArray(data.stickyNotes) || data.stickyNotes.some((note: any) => !note || typeof note.id !== 'string' || typeof note.content !== 'string'))) throw new Error('Sticky note data in Drive is invalid. Your local data was not changed.');
  const jobStores = ['jobApplications','jobContacts','jobActivities','jobEmailLinks','jobInterviews','jobFollowUps'];
  if (jobStores.some(name => data[name] !== undefined && (!Array.isArray(data[name]) || data[name].some((item: any) => !item || typeof item.id !== 'string' || (name === 'jobApplications' ? typeof item.companyName !== 'string' || typeof item.jobTitle !== 'string' : typeof item.applicationId !== 'string'))))) throw new Error('Job Search data in Drive is invalid. Your local data was not changed.');
  const allowedJobStages = ['Applied','Call Received','Email Received','First Round','Second Round','HR Round','Waiting for Response','Offer Received','Rejected','Withdrawn','Closed'];
  if ((data.jobApplications || []).some((app: any) => !allowedJobStages.includes(app.currentStage) || !['Low','Medium','High'].includes(app.priority) || (app.jobUrl && !isSafeHttpUrl(app.jobUrl))) || (data.jobEmailLinks || []).some((link: any) => !isGmailUrl(link.url))) throw new Error('Job Search stage or link data in Drive is invalid. Your local data was not changed.');
  const jobIds = new Set((data.jobApplications || []).map((application: any) => application.id));
  if (jobStores.slice(1).some(name => (data[name] || []).some((item: any) => !jobIds.has(item.applicationId)))) throw new Error('Job Search records in Drive have a missing application. Your local data was not changed.');
  if (data.learningGoals.some((goal: any) => (goal.startDate && goal.endDate && goal.endDate < goal.startDate) || ['weekdayHours','weekendHours'].some(key => goal[key] !== undefined && (!Number.isFinite(goal[key]) || goal[key] < 0))) || data.learningTopics.some((topic: any) => (topic.estimatedHours !== undefined && (!Number.isFinite(topic.estimatedHours) || topic.estimatedHours < 0)) || (topic.estimateManual !== undefined && typeof topic.estimateManual !== 'boolean'))) throw new Error('Learning schedule data in Drive is invalid. Your local data was not changed.');
  if (data.reminders.some((reminder: any) => reminder.repeat !== undefined && !['none','daily','weekly','monthly','yearly'].includes(reminder.repeat))) throw new Error('A reminder in Drive has an unsupported repeat schedule. Your local data was not changed.');
  const settings = Array.isArray(data.settings) ? data.settings[0] : data.settings;
  if (!settings || typeof settings.id !== 'string' || !['light','dark'].includes(settings.theme)) throw new Error('The LifeOS settings in Drive are invalid. Your local data was not changed.');
  const checkpoint = typeof backup.checkpoint === 'string' ? backup.checkpoint : typeof backup.exportedAt === 'string' ? backup.exportedAt : file?.modifiedTime || '';
  return { data: { ...data, stickyNotes: data.stickyNotes || [], ...Object.fromEntries(jobStores.map(name => [name, data[name] || []])), settings } as Store, checkpoint };
}

export async function writeDriveData(data: Store): Promise<string> {
  const checkpoint = new Date().toISOString();
  const contents = JSON.stringify({ app: 'LifeOS', formatVersion: 1, exportedAt: checkpoint, checkpoint, data: { ...data, settings: [data.settings] } });
  if (fileId) {
    await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: contents });
    return checkpoint;
  }
  const boundary = `lifeos_${crypto.randomUUID()}`;
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: APP_DATA_NAME, parents: ['appDataFolder'], mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${contents}\r\n--${boundary}--`;
  const created = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart }).then(r => r.json()) as { id?: string };
  fileId = created.id;
  if (!fileId) throw new Error('Google Drive did not return the saved file ID.');
  return checkpoint;
}

function isSafeHttpUrl(value: string) {
  try { const url = new URL(value); return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password; }
  catch { return false; }
}

function isGmailUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'mail.google.com' || url.hostname === 'gmail.com') && url.pathname !== '/'; }
  catch { return false; }
}
