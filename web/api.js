// Talks to the Apps Script API.
//
// Apps Script doesn't answer CORS preflight requests, so writes go as
// text/plain with mode no-cors. The reply can't be read: writes are
// fire-and-forget. Reads are simple GETs, which Apps Script allows cross-origin.
export function createApi(fetchFn, apiUrl) {
  return {
    async sendDay(token, day) {
      try {
        await fetchFn(apiUrl, {
          method: 'POST',
          mode: 'no-cors',
          // Lets the request finish even if the app is closed right after a tap.
          keepalive: true,
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'day', token, ...day }),
        });
      } catch {
        // Offline: the day is still saved locally.
      }
    },

    async fetchState(token) {
      const response = await fetchFn(`${apiUrl}?action=state&token=${encodeURIComponent(token)}`);
      return response.json();
    },
  };
}
