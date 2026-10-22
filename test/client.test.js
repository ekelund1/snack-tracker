import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../web/api.js';

const API_URL = 'https://example.test/exec';

// Records each call and answers with the given response.
function fakeFetch(respond = () => ({ json: async () => ({ ok: true }) })) {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    return respond();
  };
  return { calls, fetchFn };
}

const DAY = {
  profile: 'J',
  date: '2026-10-20',
  no_sweets: true,
  activity: false,
  workout: true,
  client_updated_at: 1234,
};

test('given a day, when sending it, then the full day state and token are posted as text/plain without CORS', async () => {
  const { calls, fetchFn } = fakeFetch();

  await createApi(fetchFn, API_URL).sendDay('secret', DAY);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, API_URL);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.mode, 'no-cors');
  assert.equal(calls[0].options.keepalive, true);
  assert.equal(calls[0].options.headers['Content-Type'], 'text/plain');
  assert.deepEqual(JSON.parse(calls[0].options.body), { action: 'day', token: 'secret', ...DAY });
});

test('given no network, when sending a day, then it fails quietly', async () => {
  const fetchFn = async () => {
    throw new TypeError('Failed to fetch');
  };

  await assert.doesNotReject(createApi(fetchFn, API_URL).sendDay('secret', DAY));
});

test('given a token, when fetching state, then the state action is requested with the encoded token', async () => {
  const state = { ok: true, days: [] };
  const { calls, fetchFn } = fakeFetch(() => ({ json: async () => state }));

  const result = await createApi(fetchFn, API_URL).fetchState('a b&c');

  assert.equal(calls[0].url, `${API_URL}?action=state&token=a%20b%26c`);
  assert.deepEqual(result, state);
});
