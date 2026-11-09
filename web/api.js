// Talks to the Apps Script API.
//
// Apps Script doesn't answer CORS preflight requests, so writes go as
// text/plain with mode no-cors. The reply can't be read: writes are
// fire-and-forget. Reads are simple GETs, which Apps Script allows cross-origin.
export function createApi(fetchFn, apiUrl) {
  // True once the server has answered, false when offline.
  async function post(body) {
    try {
      await fetchFn(apiUrl, {
        method: 'POST',
        mode: 'no-cors',
        // Lets the request finish even if the app is closed right after a tap.
        keepalive: true,
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(body),
      });
      return true;
    } catch {
      return false;
    }
  }

  async function get(action, token) {
    const response = await fetchFn(`${apiUrl}?action=${action}&token=${encodeURIComponent(token)}`);
    return response.json();
  }

  return {
    // Offline: the day is still saved locally.
    async sendDay(token, day) {
      await post({ action: 'day', token, ...day });
    },

    fetchState: (token) => get('state', token),

    // One of Plant-Life's writes: plant, remove_plant, water or unwater.
    sendPlant: (token, action, fields) => post({ action, token, ...fields }),

    fetchPlants: (token) => get('plants', token),
  };
}
