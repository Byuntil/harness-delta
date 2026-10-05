import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { IdSchema } from './contracts.js';
import { claudeTelemetryEnv, type TelemetryDestination } from './otel-launch-settings.js';

export interface ClaudeNativeProbeOptions {
  /** Caller-owned ignored directory, never a user's configuration directory. */
  workspace: string;
  /** Explicit caller evidence, not backend or executable attestation. */
  binary: { path: string; version: string; sha256: string };
  destination: TelemetryDestination; nativeSessionId: string; model: string; effort: 'high';
  /** Supervisor-owned bounded metadata hook mediator; not executed by preparation. */
  hookCommand: string;
}
export interface ClaudeProbeManifest {
  schemaVersion: 1; processId: string; nativeSessionId: string; binary: ClaudeNativeProbeOptions['binary'];
  model: string | null; effort: string | null; nativeSchemaQualified: false;
  limits: { plannedRequests: number; wallTimeMs: number; estimatedBudgetUsd: string; hardBillingBound: null };
}
export interface PreparedClaudeNativeProbe {
  manifest: ClaudeProbeManifest; manifestPath: string; settingsPath: string; argv: readonly string[];
  /** Removes ephemeral settings only; durable manifest/reservations survive. */
  dispose: () => Promise<void>;
}
const invalid = (): never => { throw new Error('claude_probe_invalid_preparation'); };
/** Preparation only: no spawn, authentication lookup, product update or settings
 * activation. The production builder remains unchanged. Native invocation and a
 * hook/log/trace gateway require separate authorization and supervisor wiring.
 */
export interface ClaudeWorkflowInvocation {
  model:string|null; effort:string|null; childRuntime?:{model:string;effort:string}|undefined;
  instructions:string; maxTurns:number; requestLimit:number; durationMs:number;
}
export async function prepareClaudeNativeProbe(options: ClaudeNativeProbeOptions, workflow?:ClaudeWorkflowInvocation): Promise<PreparedClaudeNativeProbe> {
  if (options.binary.version !== '2.1.288' || !/^[a-f0-9]{64}$/.test(options.binary.sha256) ||
    !options.binary.path.startsWith('/') || /[\n\r\0]/.test(options.binary.path) ||
    options.model !== 'claude-sonnet-5-5' || options.effort !== 'high' ||
    !/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(options.nativeSessionId) ||
    options.hookCommand.length === 0 || options.hookCommand.length > 4096 || /[\n\r\0]/.test(options.hookCommand)) invalid();
  if (workflow && (workflow.instructions.length === 0 || workflow.instructions.length > 1048576 || !Number.isSafeInteger(workflow.maxTurns) || workflow.maxTurns < 1 || workflow.maxTurns > 64)) invalid();
  const env = { ...claudeTelemetryEnv(options.destination),
    CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1', ENABLE_ENHANCED_TELEMETRY_BETA: '1', OTEL_TRACES_EXPORTER: 'otlp',
    OTEL_LOGS_EXPORT_INTERVAL: '1000', OTEL_TRACES_EXPORT_INTERVAL: '1000', DISABLE_AUTOUPDATER: '1',
    // Observed 2.1.288 runs Agent children asynchronously otherwise, adding a root request after the child.
    ...(workflow ? {} : { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' }),
  };
  const workspace = resolve(options.workspace);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if (lstatSync(workspace).isSymbolicLink() || !lstatSync(workspace).isDirectory()) invalid();
  const manifest: ClaudeProbeManifest = { schemaVersion: 1, processId: options.destination.processId,
    nativeSessionId: options.nativeSessionId, binary: { ...options.binary }, model: workflow ? workflow.model : options.model, effort: workflow ? workflow.effort : options.effort,
    nativeSchemaQualified: false, limits: { plannedRequests: workflow?.requestLimit ?? 3, wallTimeMs: workflow?.durationMs ?? 120000, estimatedBudgetUsd: '0.10', hardBillingBound: null } };
  const manifestPath = join(workspace, 'claude-probe-manifest.json');
  const serialized = JSON.stringify(manifest);
  let manifestExists = false; let manifestFailed = false;
  try { await writeFile(manifestPath, serialized, { mode: 0o600, flag: 'wx' }); }
  catch (error) {
    manifestExists = error instanceof Error && 'code' in error && error.code === 'EEXIST';
    manifestFailed = !manifestExists;
  }
  // Do not attach raw I/O causes: they may contain caller-owned private paths.
  if (manifestFailed) throw new Error('claude_probe_manifest_failed');
  if (manifestExists && (lstatSync(manifestPath).isSymbolicLink() || await readFile(manifestPath, 'utf8') !== serialized)) throw new Error('claude_probe_manifest_conflict');
  const directory = await mkdtemp(join(workspace, 'ephemeral-'));
  const settingsPath = join(directory, 'settings.json'); const agentsPath = join(directory, 'agents.json');
  const instructionPath = join(directory, 'assigned-instructions.md');
  const mcpPath = join(directory, 'mcp.json'); const dispose = () => rm(directory, { recursive: true, force: true });
  const command = { type: 'command', command: options.hookCommand, timeout: 5 };
  const hooks = Object.fromEntries([
    ['SessionStart', 'startup'], ['PreToolUse', '^Agent$'], ['SubagentStart', '^qualification-child$'],
    ['SubagentStop', '^qualification-child$'], ['SessionEnd', ''],
  ].map(([event, matcher]) => [event!, [{ matcher, hooks: [command] }]]));
  try {
    await writeFile(settingsPath, JSON.stringify({ env, ...(workflow ? { ...(workflow.model !== null ? {model:workflow.model} : {}), ...(workflow.effort !== null ? {effortLevel:workflow.effort} : {}) } : {model:options.model,effortLevel:options.effort}), hooks }), { mode: 0o600, flag: 'wx' });
    await writeFile(agentsPath, JSON.stringify({ 'qualification-child': { description: 'Synthetic one-response qualification child',
      prompt: 'Return one short synthetic acknowledgment. Use no tools or other agents.', model: workflow?.childRuntime?.model ?? options.model, effort: workflow?.childRuntime?.effort ?? options.effort,
      tools: [], disallowedTools: ['Agent', 'Bash', 'Read', 'Write', 'Edit', 'WebFetch', 'WebSearch'],
      maxTurns: 1, omitClaudeMd: true, background: false } }), { mode: 0o600, flag: 'wx' });
    if (workflow) await writeFile(instructionPath,workflow.instructions,{mode:0o600,flag:'wx'});
    await writeFile(mcpPath, JSON.stringify({ mcpServers: {} }), { mode: 0o600, flag: 'wx' });
  } catch { await dispose(); throw new Error('claude_probe_settings_failed'); }
  const argv = ['-p', '--model', options.model, '--effort', options.effort, '--max-turns', '2', '--max-budget-usd', '0.10',
    // Observed 2.1.288 default is auto mode; its classifier issues extra requests with another model.
    '--restricted', '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--tools', 'Agent', '--allowedTools', 'Agent', '--strict-mcp-config',
    '--mcp-config', mcpPath, '--setting-sources', '', '--settings', settingsPath, '--agents', agentsPath,
    '--session-id', options.nativeSessionId, '--no-session-persistence', '--no-chrome', '--disable-slash-commands',
    '--prompt-suggestions', 'false', '--output-format', 'stream-json', '--verbose'];
  if (workflow) {
    argv.splice(0,argv.length,...['-p', ...(workflow.model !== null ? ['--model',workflow.model] : []),
      ...(workflow.effort !== null ? ['--effort',workflow.effort] : []), '--max-turns',String(workflow.maxTurns),'--max-budget-usd','0.10',
      '--restricted','--permission-mode','dontAsk','--permission-prompts','none','--tools',workflow.childRuntime ? 'Read,Glob,Grep,Agent' : 'Read,Glob,Grep',
      '--allowedTools',workflow.childRuntime ? 'Read,Glob,Grep,Agent' : 'Read,Glob,Grep','--strict-mcp-config','--mcp-config',mcpPath,
      '--setting-sources','','--settings',settingsPath,...(workflow.childRuntime ? ['--agents',agentsPath] : []),
      '--append-system-prompt-file',instructionPath,...(workflow.childRuntime ? ['--append-subagent-system-prompt-file',instructionPath] : []),
      '--session-id',options.nativeSessionId,'--no-session-persistence','--no-chrome','--disable-slash-commands',
      '--prompt-suggestions','false','--output-format','stream-json','--verbose']);
  }
  return { manifest, manifestPath, settingsPath, argv, dispose };
}
/** Reservation is irreversible even if launch/binding subsequently fails. There
 * is no paid retry path. Caller must reserve launch BEFORE spawning anything.
 */
export function reserveClaudeProbeAction(workspace: string, action: 'launch' | 'child', processId: string): void {
  if (!['launch', 'child'].includes(action) || !IdSchema.safeParse(processId).success) invalid();
  const directory = resolve(workspace);
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) invalid();
  let manifest: unknown;
  try {
    const manifestPath = join(directory, 'claude-probe-manifest.json');
    if (lstatSync(manifestPath).isSymbolicLink()) invalid();
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  } catch { throw new Error('claude_probe_reservation_scope'); }
  if (typeof manifest !== 'object' || manifest === null || !('processId' in manifest) || manifest.processId !== processId) throw new Error('claude_probe_reservation_scope');
  const suffix = createHash('sha256').update(processId).digest('hex');
  if (action === 'child') {
    try { const launched = lstatSync(join(directory, `launch-${suffix}.reserved`)); if (!launched.isFile() || launched.isSymbolicLink()) invalid(); }
    catch { throw new Error('claude_probe_launch_required'); }
  }
  const path = join(directory, `${action}-${suffix}.reserved`);
  let descriptor: number | undefined; let reservationFailure: string | null = null;
  try { descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch (error) {
    reservationFailure = error instanceof Error && 'code' in error && error.code === 'EEXIST'
      ? 'claude_probe_already_reserved' : 'claude_probe_reservation_failed';
  }
  if (reservationFailure !== null) throw new Error(reservationFailure);
  if (descriptor === undefined) throw new Error('claude_probe_reservation_failed');
  try { writeFileSync(descriptor, JSON.stringify({ schemaVersion: 1, action, processId })); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  // Namespace durability must precede any caller-side spawn. A failure still leaves
  // the reservation in place and cannot authorize an automatic retry.
  const parent = openSync(directory, constants.O_RDONLY);
  try { fsyncSync(parent); } catch { throw new Error('claude_probe_reservation_failed'); }
  finally { closeSync(parent); }
}
