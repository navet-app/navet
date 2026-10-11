import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyValidationReceipt, validationPushCommand } from './agent-validation-receipt.mjs';

const run = promisify(execFile);
const execute = (file, args) => run(file, args, { env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))) });
const directories = [];
let root;
let head;
const repository = 'example/navet';
const branch = 'feature/receipt.v1';
const threadId = 'confirmed-thread';
const timestamp = '2020-01-01T00:00:00.000Z';
const hook = 'pnpm typecheck &&\n  pnpm test:tier1 &&\n  pnpm test:tier2\n';
const git = async (args) => (await execute('git', ['-C', root, ...args])).stdout.trim();
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'navet-native-receipt-repo-')); directories.push(root);
  await execute('git', ['init', '--quiet', root]);
  await git(['config', 'remote.origin.url', `https://github.com/${repository}.git`]);
  await mkdir(path.join(root, '.husky'));
  await writeFile(path.join(root, '.husky/pre-push'), hook);
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await writeFile(path.join(root, 'scripts/receipt-check.sh'), 'echo "checked:$1"\n[ "$1" != "test:tier2" ] || [ "$NAVET_TEST_FAIL_TIER" != "yes" ]\n');
  await git(['add', '.husky/pre-push', 'scripts/receipt-check.sh']);
  await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'test: receipt fixture']);
  head = await git(['rev-parse', 'HEAD']);
});
afterAll(async () => { await Promise.all(directories.map((directory) => rm(directory, { recursive: true, force: true }))); });

async function fixture(changeRecord = () => {}, changeReceipt = () => {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'navet-native-receipt-'));directories.push(dir);
  const record = { timestamp, type: 'event_msg', payload: { type: 'item_completed', thread_id: threadId,
    item: { type: 'CommandExecution', id: 'native-operation', status: 'completed', exit_code: 0,
      command: ['/bin/zsh', '-c', validationPushCommand({ head, branch })], cwd: pathToFileURL(root).href,
      aggregated_output: `Navet validation checkout: ${head}\n$ tsc --noEmit\n$ node scripts/run-test-tier.mjs tier1\nTests  10 passed (10)\n$ node scripts/run-test-tier.mjs tier2\nTests  5 passed (5)\nNavet validation complete: ${head}\nTo https://github.com/${repository}.git\n  abcdef0..${head.slice(0, 8)}  ${head} -> ${branch}\n` } } };
  changeRecord(record);
  const raw = JSON.stringify(record) + '\n';
  const sessionFile = path.join(dir, 'native.jsonl');
  await writeFile(sessionFile, JSON.stringify({ type: 'session_meta', payload: { id: threadId } }) + '\n' +
    JSON.stringify({ type: 'response_item', payload: { type: 'message', content: 'PRIVATE_PROMPT_SENTINEL' } }) + '\n' + raw);
  const receipt = { version: 2, gate: 'local-validation', head, repository, branch, threadId,
    tier1Tests: 10, tier2Tests: 5, source: { file: sessionFile, line: 3, timestamp,
      itemId: 'native-operation', recordSha256: createHash('sha256').update(raw).digest('hex') },
    hook: { file: '.husky/pre-push', sourceAtHead: head } };
  changeReceipt(receipt);
  const receiptFile = path.join(dir, 'receipt.json');
  await writeFile(receiptFile, JSON.stringify(receipt));
  return { input: { receiptFile, expectedHead: head, repositoryRoot: root, repository, branch, threadId },
    receipt, record, sessionFile, raw };
}

async function currentFixture({ continued = false, direct = false, mutate = () => {} } = {}) {
  const value = await fixture();
  const command = validationPushCommand({ head, branch });
  const args = { cmd: command, workdir: root, login: false };
  const call = { timestamp, type: 'response_item', payload: direct
    ? { type: 'function_call', name: 'exec_command', call_id: 'push-call', arguments: JSON.stringify(args) }
    : { type: 'custom_tool_call', name: 'exec', call_id: 'push-call', input: `text(await tools.exec_command(${JSON.stringify(args)}));\n` } };
  const output = value.record.payload.item.aggregated_output;
  const result = (id, value) => ({ timestamp, type: 'response_item', payload: {
    type: direct ? 'function_call_output' : 'custom_tool_call_output', call_id: id,
    output: direct ? JSON.stringify(value) : [{ type: 'input_text', text: 'Script completed\nOutput:\n' },
      { type: 'input_text', text: JSON.stringify(value) }],
  } });
  const records = continued ? [call, result('push-call', { session_id: 42, output: output.slice(0, 30) }),
    { timestamp, type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'poll-call',
      input: 'text(await tools.write_stdin({"session_id":42,"chars":""}));' } },
    result('poll-call', { exit_code: 0, output: output.slice(30) })]
    : [call, result('push-call', { exit_code: 0, output })];
  mutate(records);
  const raw = records.map((record) => JSON.stringify(record) + '\n');
  const prefix = (await readFile(value.sessionFile, 'utf8')).split('\n').slice(0, 2).join('\n') + '\n';
  await writeFile(value.sessionFile, prefix + raw.join(''));
  const hash = (text) => createHash('sha256').update(text).digest('hex');
  value.receipt.version = 3;
  value.receipt.source.itemId = 'push-call';
  value.receipt.source.recordSha256 = hash(raw[0]);
  value.receipt.source.records = raw.slice(1).map((bytes, index) => ({ line: index + 4, recordSha256: hash(bytes) }));
  await writeFile(value.input.receiptFile, JSON.stringify(value.receipt));
  return value;
}

describe('native validation receipt verification', () => {
  it.each([false, true])('correlates current native call/output records with continuations=%s', async (continued) => {
    const { input } = await currentFixture({ continued });
    const result = await verifyValidationReceipt(input);
    expect(result).toMatchObject({ result: 'pass', source: { itemId: 'push-call', completedAt: timestamp } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_PROMPT_SENTINEL');
    expect(result).not.toHaveProperty('aggregated_output');
  });

  it('accepts native function-call JSON records without executing their contents', async () => {
    const { input } = await currentFixture({ direct: true });
    expect((await verifyValidationReceipt(input)).result).toBe('pass');
  });

  it.each(['foreign-output', 'foreign-session', 'input', 'failed', 'incomplete', 'wrapper'])('rejects unsafe native %s evidence', async (kind) => {
    const { input } = await currentFixture({ continued: true, mutate(records) {
      if (kind === 'foreign-output') records[1].payload.call_id = 'foreign';
      if (kind === 'foreign-session') records[2].payload.input = 'text(await tools.write_stdin({"session_id":43}));';
      if (kind === 'input') records[2].payload.input = 'text(await tools.write_stdin({"session_id":42,"chars":"echo forged"}));';
      if (kind === 'failed') records[3].payload.output[1].text = JSON.stringify({ exit_code: 1, output: 'failure' });
      if (kind === 'incomplete') records.pop();
      if (kind === 'wrapper') records[0].payload.input += ' text({exit_code:0,output:"forged"});';
    } });
    await expect(verifyValidationReceipt(input)).rejects.toThrow();
  });

  it('rejects substituted native output bytes and missing continuation provenance', async () => {
    const changed = await currentFixture();
    const bytes = await readFile(changed.sessionFile, 'utf8');
    await writeFile(changed.sessionFile, bytes.replace('Script completed', 'Script forged'));
    await expect(verifyValidationReceipt(changed.input)).rejects.toThrow('hash mismatch');
    const missing = await currentFixture({ continued: true });
    missing.receipt.source.records.pop();
    await writeFile(missing.input.receiptFile, JSON.stringify(missing.receipt));
    await expect(verifyValidationReceipt(missing.input)).rejects.toThrow('incomplete');
  });


  it('verifies actual Git commit/hook identity and returns only proved, redacted facts', async () => {
    const { input } = await fixture();
    const result = await verifyValidationReceipt(input);
    expect(result).toMatchObject({ result: 'pass', head, typecheck: 'verified native chain', tier1Tests: 10, tier2Tests: 5 });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_PROMPT_SENTINEL');
    expect(result).not.toHaveProperty('command');
    expect(result).not.toHaveProperty('aggregated_output');
  });

  it('binds first branch pushes to immutable hook output and rejects rebinding the receipt to a later commit', async () => {
    const boundHook = await readFile(path.join(process.cwd(), '.husky/pre-push'), 'utf8');
    await writeFile(path.join(root, '.husky/pre-push'), boundHook);
    await git(['add', '.husky/pre-push']);
    await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'test: bound push hook']);
    head = await git(['rev-parse', 'HEAD']);
    const originalHead = head;
    const { input, receipt } = await fixture((record) => {
      record.payload.item.aggregated_output = record.payload.item.aggregated_output.replace(
        `abcdef0..${head.slice(0, 8)}`, '* [new branch]').replace(`Navet validation complete: ${head}`, `Navet validated push: ${head} refs/heads/${branch}\nNavet validation complete: ${head}`);
    });
    expect((await verifyValidationReceipt(input)).result).toBe('pass');
    await writeFile(path.join(root, 'extra.txt'), 'later unvalidated commit');
    await git(['add', 'extra.txt']);
    await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'test: later unvalidated head']);
    head = await git(['rev-parse', 'HEAD']);
    await git(['update-ref', `refs/remotes/origin/${branch}`, head]);
    await writeFile(input.receiptFile, JSON.stringify({ ...receipt, head, hook: { ...receipt.hook, sourceAtHead: head } }));
    await expect(verifyValidationReceipt({ ...input, expectedHead: head })).rejects.toThrow('commit-bound validation');
    const missing = await fixture((record) => {
      record.payload.item.aggregated_output = record.payload.item.aggregated_output.replace(`abcdef0..${head.slice(0, 8)}`, '* [new branch]');
    });
    await expect(verifyValidationReceipt(missing.input)).rejects.toThrow('immutable push-time');
    expect(originalHead).not.toBe(head);
  });

  it('prints the captured Git push head only after the complete validation chain passes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'navet-push-hook-')); directories.push(dir);
    const pnpm = path.join(dir, 'pnpm');
    await writeFile(pnpm, '#!/bin/sh\n[ "$1" != "test:tier2" ] || [ "$NAVET_TEST_FAIL_TIER" != "yes" ]\n');
    await chmod(pnpm, 0o755);
    const hookFile = path.join(process.cwd(), '.husky/pre-push');
    const refs = `refs/heads/${branch} ${head} refs/heads/${branch} ${'0'.repeat(40)}\n`;
    const invoke = (fail) => new Promise((resolve) => {
      const child = spawn('/bin/sh', [hookFile], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, NAVET_TEST_FAIL_TIER: fail } });
      let output = ''; child.stdout.on('data', (data) => { output += data; });
      child.on('close', (code) => resolve({ code, output })); child.stdin.end(refs);
    });
    expect(await invoke('no')).toEqual({ code: 0, output: `Navet validated push: ${head} refs/heads/${branch}\n` });
    expect(await invoke('yes')).toEqual({ code: 1, output: '' });
  });

  it('executes the committed validation inputs despite substituted hooks and delegated scripts', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'navet-immutable-hook-')); directories.push(dir);
    const prior = await readFile(path.join(root, '.husky/pre-push'), 'utf8');
    await writeFile(path.join(dir, 'pnpm'), '#!/bin/sh\nif [ "$1" = "install" ]; then\n  [ "$NAVET_TEST_DIRTY_INSTALL" != "yes" ] || echo forged > scripts/receipt-check.sh\n  exit 0\nfi\n/bin/sh scripts/receipt-check.sh "$1"\n');
    await chmod(path.join(dir, 'pnpm'), 0o755);
    const priorDelegate = await readFile(path.join(root, 'scripts/receipt-check.sh'), 'utf8');
    await writeFile(path.join(root, 'scripts/receipt-check.sh'), 'echo forged-delegate; exit 0\n');
    await writeFile(path.join(root, '.husky/pre-push'), 'echo forged-validation; exit 0\n');
    const command = validationPushCommand({ head, branch }).split(' && git push origin ')[0];
    const options = { cwd: root, env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))), PATH: `${dir}:${process.env.PATH}` } };
    try {
      const { stdout } = await run('/bin/sh', ['-c', command], options);
      expect(stdout).toContain('checked:typecheck');
      expect(stdout).toContain('checked:test:tier1');
      expect(stdout).toContain('checked:test:tier2');
      expect(stdout).toContain(`Navet validated push: ${head} refs/heads/${branch}`);
      expect(stdout).not.toContain('forged-validation');
      expect(stdout).not.toContain('forged-delegate');
      expect(stdout).toContain(`Navet validation complete: ${head}`);
      await expect(run('/bin/sh', ['-c', command], { ...options,
        env: { ...options.env, NAVET_TEST_FAIL_TIER: 'yes' } })).rejects.toMatchObject({ code: 1 });
      await expect(run('/bin/sh', ['-c', command], { ...options,
        env: { ...options.env, NAVET_TEST_DIRTY_INSTALL: 'yes' } })).rejects.toMatchObject({ code: 1 });
      expect(await git(['worktree', 'list', '--porcelain'])).not.toContain('navet-validation.');
    } finally {
      await writeFile(path.join(root, '.husky/pre-push'), prior);
      await writeFile(path.join(root, 'scripts/receipt-check.sh'), priorDelegate);
    }
  });

  it.each(['head', 'repository', 'branch', 'threadId'])('rejects mismatched expected %s', async (key) => {
    const { input } = await fixture();
    const changed = key === 'head' ? 'a'.repeat(40) : key === 'repository' ? 'other/repo' : 'different';
    await expect(verifyValidationReceipt({ ...input, [key === 'head' ? 'expectedHead' : key]: changed })).rejects.toThrow('mismatch');
  });

  it('rejects a substituted native line even with an otherwise valid receipt', async () => {
    const { input } = await fixture(() => {}, (receipt) => { receipt.source.recordSha256 = '0'.repeat(64); });
    await expect(verifyValidationReceipt(input)).rejects.toThrow('hash mismatch');
  });

  it('rejects a foreign native session and foreign nested execution', async () => {
    const foreign = await fixture((record) => { record.payload.thread_id = 'foreign'; });
    await expect(verifyValidationReceipt(foreign.input)).rejects.toThrow('matching successful');
    const wrongSession = await fixture();
    const bytes = await readFile(wrongSession.sessionFile, 'utf8');
    await writeFile(wrongSession.sessionFile, bytes.replace('"id":"confirmed-thread"', '"id":"foreign"'));
    await expect(verifyValidationReceipt(wrongSession.input)).rejects.toThrow('thread identity');
  });

  it.each(['failed', 'pending', 'bypassed', 'masked', 'dirty-hook'])('rejects %s command execution', async (kind) => {
    const { input } = await fixture((record) => {
      const item = record.payload.item;
      if (kind === 'dirty-hook') item.command[2] = `git push origin ${branch}`;
      if (kind === 'failed') item.exit_code = 1;
      if (kind === 'pending') item.status = 'inProgress';
      if (kind === 'bypassed') item.command[2] = `HUSKY=0 git push origin ${branch}`;
      if (kind === 'masked') item.command[2] += '; true';
    });
    await expect(verifyValidationReceipt(input)).rejects.toThrow('ordinary push');
  });

  it.each(['typecheck', 'tier1', 'tier2', 'failed-tier', 'destination', 'pushed-head', 'branch', 'checkout', 'completion'])('rejects incomplete or wrong %s evidence', async (kind) => {
    const { input } = await fixture((record) => {
      const item = record.payload.item;
      const replacements = { checkout: [`Navet validation checkout: ${head}`, 'missing'],
        completion: [`Navet validation complete: ${head}`, 'missing'], typecheck: ['$ tsc --noEmit', 'missing'], tier1: ['Tests  10 passed (10)', 'missing'],
        tier2: ['Tests  5 passed (5)', 'missing'], 'failed-tier': ['Tests  10 passed (10)', 'Tests  1 failed | 10 passed (11)'],
        destination: [`To https://github.com/${repository}.git`, 'To https://github.com/other/repo.git'],
        'pushed-head': [head.slice(0, 8), 'ffffffff'], branch: [`${head} -> ${branch}`, 'feature/receiptXv1 -> feature/receiptXv1'] };
      item.aggregated_output = item.aggregated_output.replace(...replacements[kind]);
    });
    await expect(verifyValidationReceipt(input)).rejects.toThrow();
  });

  it('rejects an unfinished writer tail and malformed complete prefixes', async () => {
    const partial = await fixture();
    const bytes = await readFile(partial.sessionFile, 'utf8');await writeFile(partial.sessionFile, bytes.slice(0, -1));
    await expect(verifyValidationReceipt(partial.input)).rejects.toThrow('Complete native receipt');
    const malformed = await fixture();await writeFile(malformed.sessionFile, '{bad}\n' + malformed.raw);
    await expect(verifyValidationReceipt(malformed.input)).rejects.toThrow('Malformed');
  });

  it('rejects another checkout and another repository remote', async () => {
    const other = await fixture((record) => { record.payload.item.cwd = tmpdir(); });
    await expect(verifyValidationReceipt(other.input)).rejects.toThrow('ordinary push');
    const valid = await fixture();await git(['config', 'remote.origin.url', 'https://github.com/other/repo.git']);
    try { await expect(verifyValidationReceipt(valid.input)).rejects.toThrow('repository mismatch'); }
    finally { await git(['config', 'remote.origin.url', `https://github.com/${repository}.git`]); }
  });

  it('rejects future native command timestamps even when the receipt repeats them', async () => {
    const future = '2099-01-01T00:00:00.000Z';
    const { input } = await fixture((record) => { record.timestamp = future; }, (receipt) => { receipt.source.timestamp = future; });
    await expect(verifyValidationReceipt(input)).rejects.toThrow('ordinary push');
  });

  it('does not trust receipt assertions about counts or commit-bound hooks', async () => {
    const counts = await fixture(() => {}, (receipt) => { receipt.tier1Tests = 11; });
    await expect(verifyValidationReceipt(counts.input)).rejects.toThrow('test counts');
    const hook = await fixture(() => {}, (receipt) => { receipt.hook.sourceAtHead = 'a'.repeat(40); });
    await expect(verifyValidationReceipt(hook.input)).rejects.toThrow('provenance mismatch');
  });
  // Keep: counts interpolated into the summary matcher must be validated as integers.
  it.each(['10|.*', '(a+)+$', '.*', -1, 1.5])('rejects unsafe test counts: %s', async (count) => {
    const value = await fixture(() => {}, (receipt) => { receipt.tier1Tests = count; });
    await expect(verifyValidationReceipt(value.input)).rejects.toThrow('counts or provenance mismatch');
  });
  it('isolates inherited hook Git variables for verifier reads and temporary repository creation', async () => {
    const value = await fixture();
    const isolated = await mkdtemp(path.join(tmpdir(), 'navet-hook-git-env-'));directories.push(isolated);
    const prior = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(root, '.git');
    try {
      expect((await verifyValidationReceipt(value.input)).result).toBe('pass');
      await execute('git', ['init', '--quiet', isolated]);
      expect(await readFile(path.join(isolated, '.git/HEAD'), 'utf8')).toMatch(/^ref:/);
      expect(await git(['config', '--get', 'core.bare'])).toBe('false');
    } finally {
      if (prior === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = prior;
    }
  });

  it('rejects a changed hook at the actual referenced commit despite apparently passing output', async () => {
    await writeFile(path.join(root, '.husky/pre-push'), 'pnpm typecheck\n');
    await git(['add', '.husky/pre-push']);
    await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'test: unsupported hook']);
    head = await git(['rev-parse', 'HEAD']);
    const { input } = await fixture();
    await expect(verifyValidationReceipt(input)).rejects.toThrow('Unsupported commit-bound');
  });

});
