import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const HOOK = 'pnpm typecheck && pnpm test:tier1 && pnpm test:tier2';
const BOUND_HOOK = String.raw`navet_push_refs="$(cat)"
pnpm typecheck &&
  pnpm test:tier1 &&
  pnpm test:tier2 &&
  printf '%s\n' "$navet_push_refs" | while read -r navet_local_ref navet_local_sha navet_remote_ref navet_remote_sha; do
    printf 'Navet validated push: %s %s\n' "$navet_local_sha" "$navet_remote_ref"
  done`;
const COMBINED_HOOK = BOUND_HOOK.replace('pnpm test:tier1 &&\n  pnpm test:tier2', 'pnpm test:blocking');
const normalizeHook = (value) => value.replace(/\s+/g, ' ').trim();
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

// Validate all tracked inputs and installed dependencies in a fresh checkout of
// the recorded commit, then perform the ordinary push with its normal hooks.
export function validationPushCommand({ head, branch }) {
  if (!sha(head) || typeof branch !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch)) {
    throw new Error('Valid commit and branch are required.');
  }
  const refs = `refs/heads/${branch} ${head} refs/heads/${branch} ${'0'.repeat(40)}`;
  return `navet_validation_root="$(mktemp -d /tmp/navet-validation.XXXXXX)" && ` +
    `trap 'git worktree remove --force "$navet_validation_root" >/dev/null 2>&1; rmdir "$navet_validation_root" 2>/dev/null || true' EXIT && ` +
    `git worktree add --detach "$navet_validation_root" ${head} && ` +
    `(cd "$navet_validation_root" && pnpm install --frozen-lockfile && ` +
    `git diff --exit-code HEAD -- && test -z "$(git ls-files --others --exclude-standard)" && ` +
    `printf 'Navet validation checkout: %s\\n' '${head}' && ` +
    `printf '%s\\n' '${refs}' | /bin/sh .husky/pre-push && ` +
    `printf 'Navet validation complete: %s\\n' '${head}') && git push origin ${head}:refs/heads/${branch}`;
}

async function git(root, args) {
  try { return (await execute('git', ['-C', root, ...args], { maxBuffer: 1_048_576,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))) })).stdout.trim(); }
  catch { throw new Error('Commit-bound Git evidence is unavailable.'); }
}

async function nativeRecord(file, targetLine, threadId, expectedHash) {
  const snapshot = await stat(file);
  if (!snapshot.isFile() || !snapshot.size) throw new Error('Native receipt source is unavailable.');
  let buffer = '';
  let number = 0;
  let identity = false;
  for await (const chunk of createReadStream(file, { encoding: 'utf8', end: snapshot.size - 1 })) {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const raw = buffer.slice(0, newline + 1);
      buffer = buffer.slice(newline + 1);
      number += 1;
      if (raw.length > 16 * 1024 * 1024) throw new Error('Native receipt record exceeds its size limit.');
      let record;
      try { record = JSON.parse(raw); } catch { throw new Error('Malformed complete native receipt record.'); }
      if (record.type === 'session_meta') {
        if (identity || record.payload?.id !== threadId) throw new Error('Native receipt thread identity mismatch.');
        identity = true;
      } else if (!identity) throw new Error('Native receipt metadata must precede command evidence.');
      if (number === targetLine) {
        if (!identity || createHash('sha256').update(raw).digest('hex') !== expectedHash) {
          throw new Error('Native receipt record hash mismatch.');
        }
        return record;
      }
    }
    if (buffer.length > 16 * 1024 * 1024) throw new Error('Native receipt record exceeds its size limit.');
  }
  throw new Error('Complete native receipt source line is missing.');
}

function nativeCall(record) {
  const payload = record.payload;
  if (record.type !== 'response_item' || typeof payload?.call_id !== 'string' || !payload.call_id) {
    throw new Error('Native receipt command call identity is missing.');
  }
  let name;
  let input;
  if (payload.type === 'function_call') {
    name = payload.name; input = payload.arguments;
  } else if (payload.type === 'custom_tool_call' && payload.name === 'exec') {
    // Accept one literal tool call, never evaluate arbitrary orchestration code.
    const match = /^text\(await tools\.(exec_command|write_stdin)\((\{[\s\S]*\})\)\);?$/.exec(typeof payload.input === 'string' ? payload.input.trim() : '');
    if (!match) throw new Error('Unsupported native command wrapper.');
    name = match[1]; input = match[2];
  } else if (payload.type === 'custom_tool_call') {
    name = payload.name; input = payload.input;
  }
  if (!['exec_command', 'write_stdin'].includes(name) || typeof input !== 'string') {
    throw new Error('Unsupported native command tool.');
  }
  let args;
  try { args = JSON.parse(input); } catch { throw new Error('Native command arguments must be literal JSON.'); }
  if (!args || Array.isArray(args) || typeof args !== 'object') throw new Error('Native command arguments are invalid.');
  return { name, args, id: payload.call_id, outputType: payload.type === 'function_call' ? 'function_call_output' : 'custom_tool_call_output' };
}

function nativeOutput(record, call) {
  const payload = record.payload;
  if (record.type !== 'response_item' || payload?.type !== call.outputType || payload.call_id !== call.id) {
    throw new Error('Native output belongs to another command call.');
  }
  const blocks = Array.isArray(payload.output) ? payload.output : [{ type: 'input_text', text: payload.output }];
  const results = [];
  for (const block of blocks) {
    if (!['input_text', 'text'].includes(block?.type) || typeof block.text !== 'string') {
      throw new Error('Unsupported native command output block.');
    }
    try {
      const value = JSON.parse(block.text);
      if (value && typeof value.output === 'string') results.push(value);
    } catch { /* Native wrapper metadata is text, not an execution result. */ }
  }
  if (results.length !== 1) throw new Error('Native command output must contain one execution result.');
  return results[0];
}

async function currentNativeExecution(record, source, threadId, root, command) {
  const call = nativeCall(record);
  if (call.id !== source.itemId || call.name !== 'exec_command' || call.args.cmd !== command ||
      typeof call.args.workdir !== 'string' || await realpath(call.args.workdir) !== root ||
      (call.args.shell !== undefined && !['/bin/zsh', '/bin/bash'].includes(call.args.shell)) || call.args.tty === true) {
    throw new Error('Native receipt is not the matching successful commit-bound validation and ordinary push command.');
  }
  if (!Array.isArray(source.records) || source.records.length < 1 || source.records.length > 129) {
    throw new Error('Native receipt requires hashed call and output records through completion.');
  }
  const seenCalls = new Set([call.id]);
  let pending = call;
  let result;
  let output = '';
  let lastLine = source.line;
  let lastTime = Date.parse(record.timestamp);
  let completedAt;
  for (const reference of source.records) {
    if (!Number.isSafeInteger(reference?.line) || reference.line <= lastLine ||
        typeof reference.recordSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(reference.recordSha256)) {
      throw new Error('Native receipt continuation provenance is invalid.');
    }
    const next = await nativeRecord(source.file, reference.line, threadId, reference.recordSha256);
    const time = Date.parse(next.timestamp);
    if (!Number.isFinite(time) || time < lastTime || time > Date.now() ||
        (next.payload?.thread_id !== undefined && next.payload.thread_id !== threadId)) {
      throw new Error('Native receipt continuation identity or time mismatch.');
    }
    lastLine = reference.line; lastTime = time;
    if (pending) {
      result = nativeOutput(next, pending);
      if (result.isError || (result.exit_code !== undefined && result.exit_code !== 0) ||
          (result.exit_code === undefined && (!Number.isSafeInteger(result.session_id) || result.session_id <= 0)) ||
          (result.exit_code === 0 && result.session_id !== undefined)) {
        throw new Error('Native command did not complete successfully.');
      }
      output += result.output;
      pending = null;
      if (result.exit_code === 0) completedAt = next.timestamp;
    } else {
      if (completedAt) throw new Error('Native receipt continues after command completion.');
      pending = nativeCall(next);
      if (pending.name !== 'write_stdin' || seenCalls.has(pending.id) || pending.args.session_id !== result.session_id ||
          (pending.args.chars !== undefined && pending.args.chars !== '')) {
        throw new Error('Native command continuation targets another session or sends input.');
      }
      seenCalls.add(pending.id);
    }
  }
  if (pending || !completedAt) throw new Error('Native command receipt is incomplete.');
  return { aggregated_output: output, completedAt };
}

export async function verifyValidationReceipt({ receiptFile, expectedHead, repositoryRoot, repository, branch, threadId }) {
  if (!sha(expectedHead) || typeof receiptFile !== 'string' || !receiptFile ||
      typeof repositoryRoot !== 'string' || !repositoryRoot || typeof threadId !== 'string' || !threadId ||
      typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
      typeof branch !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch)) {
    throw new Error('Confirmed head, repository, branch, thread and private receipt inputs are required.');
  }
  let receipt;
  try { receipt = JSON.parse(await readFile(receiptFile, 'utf8')); }
  catch { throw new Error('Valid private receipt JSON is required.'); }
  const source = receipt.source;
  if (![2, 3].includes(receipt.version) || receipt.gate !== 'local-validation' || receipt.head !== expectedHead ||
      receipt.repository !== repository || receipt.branch !== branch || receipt.threadId !== threadId ||
      !Number.isSafeInteger(receipt.tier1Tests) || receipt.tier1Tests <= 0 ||
      !Number.isSafeInteger(receipt.tier2Tests) || receipt.tier2Tests <= 0 ||
      !source || typeof source.file !== 'string' || !path.isAbsolute(source.file) ||
      !Number.isSafeInteger(source.line) || source.line < 2 ||
      typeof source.recordSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.recordSha256) ||
      typeof source.itemId !== 'string' || !source.itemId || !source.timestamp ||
      receipt.hook?.file !== '.husky/pre-push' || receipt.hook.sourceAtHead !== expectedHead) {
    throw new Error('Validation receipt identity, counts or provenance mismatch.');
  }
  const root = await realpath(repositoryRoot);
  const remote = await git(root, ['remote', 'get-url', 'origin']);
  const acceptedRemotes = [`https://github.com/${repository}`, `https://github.com/${repository}.git`,
    `git@github.com:${repository}`, `git@github.com:${repository}.git`];
  if (!acceptedRemotes.includes(remote)) throw new Error('Validation receipt repository mismatch.');
  const hook = await git(root, ['show', `${expectedHead}:.husky/pre-push`]);
  const combined = normalizeHook(hook) === normalizeHook(COMBINED_HOOK);
  if (![HOOK, normalizeHook(BOUND_HOOK), normalizeHook(COMBINED_HOOK)].includes(normalizeHook(hook))) throw new Error('Unsupported commit-bound pre-push hook.');
  const record = await nativeRecord(source.file, source.line, threadId, source.recordSha256);
  if (record.timestamp !== source.timestamp || !Number.isFinite(Date.parse(record.timestamp)) || Date.parse(record.timestamp) > Date.now()) {
    throw new Error('Native receipt is not the matching successful ordinary push command.');
  }
  let item;
  if (receipt.version === 3) {
    item = await currentNativeExecution(record, source, threadId, root, validationPushCommand({ head: expectedHead, branch }));
  } else {
    item = record.payload?.item;
    if (record.type !== 'event_msg' || record.payload?.type !== 'item_completed' || record.payload.thread_id !== threadId ||
        record.timestamp !== source.timestamp || !Number.isFinite(Date.parse(record.timestamp)) || Date.parse(record.timestamp) > Date.now() ||
        item?.type !== 'CommandExecution' || item.id !== source.itemId ||
        item.status !== 'completed' || item.exit_code !== 0 || !Array.isArray(item.command) ||
        item.command.length !== 3 || !['/bin/zsh', '/bin/bash'].includes(item.command[0]) ||
        !['-c', '-lc'].includes(item.command[1]) || item.command[2] !== validationPushCommand({ head: expectedHead, branch }) ||
        typeof item.cwd !== 'string' || await realpath(item.cwd.startsWith('file:') ? fileURLToPath(item.cwd) : item.cwd) !== root) {
      throw new Error('Native receipt is not the matching successful commit-bound validation and ordinary push command.');
    }
  }
  if (typeof item.aggregated_output !== 'string') throw new Error('Native push output is missing.');
  const output = item.aggregated_output.replace(/\u001b\[[0-9;]*m/g, '');
  const startMarker = `Navet validation checkout: ${expectedHead}\n`;
  const endMarker = `Navet validation complete: ${expectedHead}\n`;
  const start = output.indexOf(startMarker);
  const end = output.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < start) throw new Error('Native receipt clean-checkout validation bounds are missing.');
  const validationOutput = output.slice(start + startMarker.length, end);
  const stages = combined
    ? ['$ tsc --noEmit', '$ node scripts/run-test-tier.mjs blocking']
    : ['$ tsc --noEmit', '$ node scripts/run-test-tier.mjs tier1', '$ node scripts/run-test-tier.mjs tier2'];
  const positions = stages.map((stage) => validationOutput.indexOf(stage));
  if (positions.some((position, index) => position < 0 || index > 0 && position <= positions[index - 1])) {
    throw new Error('Native receipt validation chain is incomplete.');
  }
  if (combined) {
    const section = validationOutput.slice(positions[1]);
    const summaries = [...section.matchAll(/^Navet blocking coverage: (.+)$/gm)];
    let coverage;
    try { coverage = summaries.length === 1 ? JSON.parse(summaries[0][1]) : null; }
    catch { throw new Error('Native receipt combined test counts are invalid.'); }
    for (const [name, count] of [['tier1', receipt.tier1Tests], ['tier2', receipt.tier2Tests]]) {
      if (!coverage || coverage[name]?.tests !== count ||
          !Number.isSafeInteger(coverage[name]?.files) || coverage[name].files <= 0) {
        throw new Error('Native receipt test counts are not a complete passing tier.');
      }
    }
    const tests = receipt.tier1Tests + receipt.tier2Tests;
    const files = coverage.tier1.files + coverage.tier2.files;
    for (const [label, count] of [['Tests', tests], ['Test Files', files]]) {
      const totals = [...section.matchAll(new RegExp(`\\b${label}\\s+(\\d+) passed \\((\\d+)\\)`, 'g'))];
      if (totals.length !== 1 || totals.some(([, passed, total]) => Number(passed) !== count || Number(total) !== count)) {
        throw new Error('Native receipt combined test counts are not a complete passing run.');
      }
    }
  } else {
    const tier1 = validationOutput.slice(positions[1], positions[2]);
    const tier2 = validationOutput.slice(positions[2]);
    for (const [section, count] of [[tier1, receipt.tier1Tests], [tier2, receipt.tier2Tests]]) {
      const summaries = [...section.matchAll(/\bTests\s+(\d+) passed \((\d+)\)/g)];
      if (!summaries.some(([, passed, total]) => Number(passed) === count && Number(total) === count)) {
        throw new Error('Native receipt test counts are not a complete passing tier.');
      }
    }
  }
  const escaped = branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pushed = new RegExp(`^\\s*[a-f0-9]{7,40}\\.\\.([a-f0-9]{7,40})\\s+${expectedHead} -> ${escaped}\\s*$`, 'm').exec(output);
  const created = new RegExp(`^\\s*\\* \\[new branch\\]\\s+${expectedHead} -> ${escaped}\\s*$`, 'm').test(output);
  if ((!pushed && !created) ||
      !output.includes(`To https://github.com/${repository}.git`) && !output.includes(`To github.com:${repository}.git`)) {
    throw new Error('Native receipt pushed head, branch or destination mismatch.');
  }
  if (pushed) {
    if (!expectedHead.startsWith(pushed[1]) || await git(root, ['rev-parse', '--verify', `${pushed[1]}^{commit}`]) !== expectedHead) {
      throw new Error('Native receipt push abbreviation is not the confirmed commit.');
    }
  } else {
    const validated = new RegExp(`^Navet validated push: ([a-f0-9]{40}) refs/heads/${escaped}\\s*$`, 'm').exec(validationOutput);
    if ((!combined && normalizeHook(hook) !== normalizeHook(BOUND_HOOK)) || !validated || validated[1] !== expectedHead ||
        validationOutput.indexOf(validated[0]) < positions.at(-1)) {
      throw new Error('Native receipt new branch lacks immutable push-time commit evidence.');
    }
  }
  // Output only the proved facts; never expose native prompts, commands or log bodies.
  return { version: 1, gate: 'local-validation', result: 'pass', head: expectedHead,
    threadId, tier1Tests: receipt.tier1Tests, tier2Tests: receipt.tier2Tests,
    typecheck: 'verified native chain', source: { line: source.line, timestamp: source.timestamp,
      itemId: source.itemId, recordSha256: source.recordSha256,
      ...(item.completedAt ? { completedAt: item.completedAt, records: source.records.map(({ line, recordSha256 }) => ({ line, recordSha256 })) } : {}) }, hookSourceAtHead: expectedHead };
}
