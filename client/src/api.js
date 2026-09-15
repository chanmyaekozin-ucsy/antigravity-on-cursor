const DASHBOARD_KEY_STORAGE = 'antigravity_api_key';

export function getDashboardKey() {
  try {
    return localStorage.getItem(DASHBOARD_KEY_STORAGE)?.trim() || '';
  } catch {
    return '';
  }
}

export function setDashboardKey(value) {
  const key = value?.trim();
  if (!key) throw new Error('Dashboard key cannot be empty.');
  localStorage.setItem(DASHBOARD_KEY_STORAGE, key);
}

/** Fetch a dashboard endpoint with the saved dashboard credential. */
export function apiFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  const key = getDashboardKey();
  if (key && !headers.has('x-dashboard-key')) {
    headers.set('x-dashboard-key', key);
  }
  return fetch(input, { ...init, headers }).then(response => {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dashboard-unauthorized'));
    }
    return response;
  });
}
