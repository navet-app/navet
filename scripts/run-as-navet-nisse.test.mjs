import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createAppJwt,
  createInstallationToken,
  parseOperation,
  performOperation,
} from './run-as-navet-nisse.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

describe('Navet Nisse GitHub App authentication', () => {
  it('creates a verifiable short-lived RS256 app JWT', () => {
    const token = createAppJwt({ appId: 123, privateKey, now: 1_800_000_000_000 });
    const [header, payload, signature] = token.split('.');
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      iat: 1_799_999_940,
      exp: 1_800_000_540,
      iss: '123',
    });
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature, 'base64url')
      )
    ).toBe(true);
  });

  it('requests an installation token with a signed app JWT', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'installation-token' }),
    });
    await expect(
      createInstallationToken({ appId: 123, installationId: 456, privateKey, fetchImpl })
    ).resolves.toBe('installation-token');
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.github.com/app/installations/456/access_tokens');
    expect(request).toMatchObject({ method: 'POST', signal: expect.any(AbortSignal) });
    expect(JSON.parse(request.body)).toEqual({
      repositories: ['navet'],
      permissions: { issues: 'write', pull_requests: 'read', metadata: 'read' },
    });
    const [header, payload, signature] = request.headers.Authorization.slice('Bearer '.length).split('.');
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature, 'base64url')
      )
    ).toBe(true);
  });

  it('limits the bot identity to comments, reactions, and request-label cleanup', () => {
    expect(parseOperation(['comment', '181', '--body-file', '/tmp/reply.md'])).toEqual({
      method: 'POST',
      path: '/repos/navet-app/navet/issues/181/comments',
      bodyFile: '/tmp/reply.md',
    });
    expect(parseOperation(['react', '1234', 'rocket'])).toEqual({
      method: 'POST',
      path: '/repos/navet-app/navet/issues/comments/1234/reactions',
      body: { content: 'rocket' },
    });
    expect(parseOperation(['unreact', '1234', '5678'])).toEqual({
      method: 'DELETE',
      path: '/repos/navet-app/navet/issues/comments/1234/reactions/5678',
    });
    expect(parseOperation(['remove-request-label', '181', 'research'])).toEqual({
      method: 'DELETE',
      path: '/repos/navet-app/navet/issues/181/labels/navet%3A%20research',
    });
    expect(parseOperation(['remove-request-label', '181', 'implement'])).toEqual({
      method: 'DELETE',
      path: '/repos/navet-app/navet/issues/181/labels/navet%3A%20implement',
    });
    expect(() => parseOperation(['remove-request-label', '181', 'other'])).toThrow('Unsupported');
    expect(() => parseOperation(['git', 'push'])).toThrow('Usage:');
    expect(() => parseOperation(['pr', 'create'])).toThrow('Usage:');
    expect(() => parseOperation(['react', '1234', 'invalid'])).toThrow('Unsupported');
  });

  it('checks issue identity before writing comments without exposing the token', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ number: 181 }) }).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 99 }),
    });
    const operation = {
      method: 'POST',
      path: '/repos/navet-app/navet/issues/181/comments',
      body: { body: 'Useful result.' },
    };
    await expect(
      performOperation({ token: 'installation-token', operation, fetchImpl })
    ).resolves.toEqual({ id: 99 });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.github.com/repos/navet-app/navet/issues/181');
    expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
    const [, request] = fetchImpl.mock.calls[1];
    expect(request.body).toBe(JSON.stringify({ body: 'Useful result.' }));
    expect(request.headers.Authorization).toBe('Bearer installation-token');
  });
  it.each([
    ['comment', '181', '--body-file', '/tmp/unused.md'],
    ['remove-request-label', '181', 'research'],
    ['react', '1234', 'rocket'],
    ['unreact', '1234', '5678'],
  ])('refuses PR mutation targets before sending any write: %s', async (...args) => {
    const operation = parseOperation(args);
    const fetchImpl = vi.fn();
    if (['react', 'unreact'].includes(args[0])) fetchImpl.mockResolvedValueOnce({ ok: true,
      json: async () => ({ id: 1234, issue_url: 'https://api.github.com/repos/navet-app/navet/issues/181' }) });
    fetchImpl.mockResolvedValueOnce({ ok: true, json: async () => ({ number: 181, pull_request: { url: 'https://api.github.com/repos/navet-app/navet/pulls/181' } }) });
    await expect(performOperation({ token: 'test', operation, fetchImpl })).rejects.toThrow('restricted to issues');
    expect(fetchImpl.mock.calls.every(([, request]) => request.method === 'GET')).toBe(true);
  });

  it.each(['react', 'unreact'])('allows %s only after resolving its comment to a verified issue', async (action) => {
    const operation = parseOperation(action === 'react' ? [action, '1234', 'rocket'] : [action, '1234', '5678']);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1234, issue_url: 'https://api.github.com/repos/navet-app/navet/issues/181' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ number: 181 }) })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    expect(await performOperation({ token: 'test', operation, fetchImpl })).toBeNull();
    expect(fetchImpl.mock.calls.map(([, request]) => request.method)).toEqual(['GET', 'GET', operation.method]);
  });

  it.each([
    { ok: false, status: 404 },
    { ok: true, json: async () => ({ number: 182 }) },
  ])('fails closed when the issue target cannot be verified', async (response) => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response);
    await expect(performOperation({ token: 'test', operation: parseOperation(['remove-request-label', '181', 'research']), fetchImpl })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses foreign comment issue URLs before forwarding the App credential', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1234, issue_url: 'https://example.invalid/repos/navet-app/navet/issues/181' }) });
    await expect(performOperation({ token: 'test', operation: parseOperation(['react', '1234', 'rocket']), fetchImpl })).rejects.toThrow('identity mismatch');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

});
