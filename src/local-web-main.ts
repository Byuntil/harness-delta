#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { Store } from './store.js';
import { createLocalWebDomain, readLocalWebManifest } from './local-web-domain.js';
import { createLocalWebServer, localWebError } from './local-web-server.js';

interface WebCommandOptions { port: string; metadata?: string; setup?: string; }
export async function startLocalWeb(store: Store, options: WebCommandOptions) {
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || store.filename === ':memory:') throw new Error('invalid_ui_request');
  const metadataFile = resolve(options.metadata ?? store.filename + '.ui.sqlite');
  if (metadataFile === resolve(store.filename)) throw new Error('invalid_ui_request');
  mkdirSync(dirname(metadataFile), { recursive: true, mode: 0o700 });
  if (!existsSync(metadataFile)) writeFileSync(metadataFile, '', { flag: 'wx', mode: 0o600 });
  chmodSync(metadataFile, 0o600);
  const profiles = options.setup ? readLocalWebManifest(resolve(options.setup)).profiles : [];
  const domain = createLocalWebDomain({ store, metadataFile, profiles });
  const origin = `http://127.0.0.1:${port}`;
  const app = createLocalWebServer({ origin, domain, metadataFile, uiRoot: fileURLToPath(new URL('./local-ui/', import.meta.url)) });
  try { await app.listen({ host: '127.0.0.1', port }); } catch (error) { await app.close(); throw error; }
  return { app, origin };
}
async function serve(store: Store, options: WebCommandOptions, print: (value: unknown) => void) {
  const { app, origin } = await startLocalWeb(store, options);
  print({ local_ui: origin, access: 'loopback_only', native_launch: false });
  await new Promise<void>((done, reject) => {
    const stop = () => { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); void app.close().then(done, reject); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  });
}
/** Integration adds only this import/registration to the existing hm CLI. */
export function registerLocalWebCommand(program: Command, store: () => Store, print: (value: unknown) => void): void {
  program.command('ui').description('Open the local browser workflow; no native agent launcher')
    .option('--port <number>', '127.0.0.1 listen port', '4318')
    .option('--metadata <file>', 'private UI metadata database (separate from measurement data)')
    .option('--setup <file>', 'existing reviewed local UI setup manifest')
    .action(async (options: WebCommandOptions) => { await serve(store(), options, print); });
}
export async function localWebMain(argv: string[]): Promise<number> {
  const program = new Command().name('hm-ui').requiredOption('--db <file>', 'measurement Store')
    .option('--port <number>', '127.0.0.1 listen port', '4318').option('--metadata <file>').option('--setup <file>');
  program.exitOverride().configureOutput({ writeErr: () => undefined });
  let store: Store | undefined;
  try {
    program.parse(argv, { from: 'user' }); const options = program.opts<WebCommandOptions & { db: string }>();
    store = new Store(options.db); await serve(store, options, value => { process.stdout.write(JSON.stringify(value) + '\n'); }); return 0;
  } catch (error) {
    process.stderr.write(localWebError(error) + '\n'); return 1;
  } finally { store?.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void localWebMain(process.argv.slice(2)).then(code => { process.exitCode = code; });
}
