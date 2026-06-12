#!/usr/bin/env node

import { promises as fsp } from 'node:fs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const BASE_DIR = path.join(os.homedir(), '.config', '.iaflow');
const FLOWS_DIR = path.join(BASE_DIR, 'flows');
const LOGS_DIR = path.join(FLOWS_DIR, 'logs');
const STATE_FILE = path.join(BASE_DIR, 'hook-state.json');
const MAX_RUN_HISTORY = 7;
const MAX_FLOW_RUNTIME_MS = 2 * 60 * 60 * 1000;
const DEFAULT_PROVIDER = 'manual';
const ANY = 'any';

const AGENT_CONFIG = {
  claude: {
    permModes: ['--permission-mode auto', '--dangerously-skip-permissions'],
    flags: '--verbose --output-format stream-json',
    promptPrefix: '-p',
  },
  codex: {
    permModes: [
      '--sandbox workspace-write --ask-for-approval never exec --skip-git-repo-check',
      '--sandbox danger-full-access --ask-for-approval never exec --skip-git-repo-check',
    ],
  },
  opencode: {
    promptPrefix: '-p',
  },
};

function printHelp() {
  console.log(`Usage:
  iaflow-hook emit <event> [--provider codex] [--cwd /repo] [--path src/file.ts]
  iaflow-hook <event> [--provider watcher] [--cwd /repo] [--paths src/a.ts,src/b.ts]
  iaflow-hook --event-json -
  iaflow-hook run <flow-id-or-name> [--cwd /repo]

Examples:
  iaflow-hook emit file.changed --provider codex --cwd "$PWD" --path src/App.tsx
  iaflow-hook file.changed --provider watcher --path src/App.tsx
  printf '%s\\n' '{"type":"file.changed","provider":"codex","paths":["src/App.tsx"]}' | iaflow-hook --event-json -

Options:
  --provider, --source <name>   Event source: codex, claude, watcher, manual, ...
  --cwd <dir>                   Working directory for matching and execution
  --path <path>                 Changed path, can be repeated
  --paths <a,b>                 Comma-separated changed paths
  --tool <name>                 Tool that produced the event, if known
  --payload-json <json>         Extra payload stored on the event
  --flow <id-or-name>           Restrict emit matching to one flow
  --event-json <path|->         Read the full hook event as JSON
  --dry-run                     Print matching flows without executing
  --json                        Print machine-readable summary
  --help                        Show this help
`);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let raw = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      raw += chunk;
    });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', reject);
  });
}

function optionValue(argv, index) {
  const item = argv[index];
  const eq = item.indexOf('=');
  if (eq >= 0) return { value: item.slice(eq + 1), nextIndex: index };
  if (index + 1 >= argv.length) throw new Error(`Missing value for ${item}`);
  return { value: argv[index + 1], nextIndex: index + 1 };
}

async function parseArgs(argv) {
  const out = {
    mode: 'emit',
    eventType: '',
    targetFlow: '',
    provider: '',
    cwd: '',
    paths: [],
    tool: '',
    payload: undefined,
    eventJson: '',
    dryRun: false,
    json: false,
  };

  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else if (arg === '--dry-run') {
      out.dryRun = true;
    } else if (arg === '--json') {
      out.json = true;
    } else if (arg.startsWith('--event-json')) {
      const parsed = optionValue(argv, i);
      out.eventJson = parsed.value;
      i = parsed.nextIndex;
    } else if (arg.startsWith('--provider') || arg.startsWith('--source')) {
      const parsed = optionValue(argv, i);
      out.provider = parsed.value;
      i = parsed.nextIndex;
    } else if (arg.startsWith('--cwd')) {
      const parsed = optionValue(argv, i);
      out.cwd = parsed.value;
      i = parsed.nextIndex;
    } else if (arg.startsWith('--paths')) {
      const parsed = optionValue(argv, i);
      out.paths.push(...parsed.value.split(','));
      i = parsed.nextIndex;
    } else if (arg.startsWith('--path')) {
      const parsed = optionValue(argv, i);
      out.paths.push(parsed.value);
      i = parsed.nextIndex;
    } else if (arg.startsWith('--tool')) {
      const parsed = optionValue(argv, i);
      out.tool = parsed.value;
      i = parsed.nextIndex;
    } else if (arg.startsWith('--payload-json')) {
      const parsed = optionValue(argv, i);
      out.payload = JSON.parse(parsed.value);
      i = parsed.nextIndex;
    } else if (arg.startsWith('--flow')) {
      const parsed = optionValue(argv, i);
      out.targetFlow = parsed.value;
      i = parsed.nextIndex;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (positionals[0] === 'run') {
    out.mode = 'run';
    out.targetFlow = positionals[1] || out.targetFlow;
  } else if (positionals[0] === 'emit') {
    out.mode = 'emit';
    out.eventType = positionals[1] || '';
  } else if (positionals[0]) {
    out.mode = 'emit';
    out.eventType = positionals[0];
  }

  if (out.eventJson) {
    const raw = out.eventJson === '-' ? await readStdin() : await fsp.readFile(out.eventJson, 'utf-8');
    const parsed = JSON.parse(raw);
    out.eventType = parsed.type || parsed.event || out.eventType;
    out.provider = parsed.provider || parsed.source || out.provider;
    out.cwd = parsed.cwd || out.cwd;
    out.paths = Array.isArray(parsed.paths)
      ? parsed.paths
      : parsed.path
        ? [parsed.path]
        : out.paths;
    out.tool = parsed.tool || out.tool;
    out.payload = parsed.payload || out.payload;
  }

  if (out.mode === 'emit' && !out.eventType && !out.help) {
    throw new Error('Missing event name. Use `iaflow-hook emit file.changed ...`.');
  }
  if (out.mode === 'run' && !out.targetFlow && !out.help) {
    throw new Error('Missing flow id or name. Use `iaflow-hook run <flow>`.');
  }

  out.cwd = out.cwd || process.cwd();
  out.provider = out.provider || DEFAULT_PROVIDER;
  out.paths = out.paths.map((p) => p.trim()).filter(Boolean);
  return out;
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf-8'));
  } catch {
    return null;
  }
}

async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

function flowPath(id) {
  return path.join(FLOWS_DIR, `${id}.json`);
}

function logPath(flowId, timestamp) {
  return path.join(LOGS_DIR, `${flowId}_${timestamp}.log`);
}

async function listFlows() {
  try {
    const files = await fsp.readdir(FLOWS_DIR);
    const flows = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const data = await readJson(path.join(FLOWS_DIR, file));
      if (data?.id && data?.prompt) flows.push(data);
    }
    return flows;
  } catch {
    return [];
  }
}

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function normalizeCwd(value) {
  if (!value) return null;
  return path.resolve(value);
}

function isWithinCwd(eventCwd, flowCwd) {
  if (!flowCwd || !eventCwd) return true;
  const rel = path.relative(flowCwd, eventCwd);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegex(pattern) {
  const normalized = normalizePath(pattern.trim());
  let out = '^';
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (ch === '*' && next === '*') {
      out += '.*';
      i += 1;
    } else if (ch === '*') {
      out += '[^/]*';
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += escapeRegex(ch);
    }
  }
  return new RegExp(`${out}$`);
}

function eventPaths(event) {
  const cwd = normalizeCwd(event.cwd);
  return (event.paths || []).map((p) => {
    const normalized = normalizePath(p);
    if (!cwd || !path.isAbsolute(normalized)) return normalized;
    return normalizePath(path.relative(cwd, normalized));
  });
}

function isHookFlow(flow) {
  return flow.triggerType === 'hook' || !!flow.hookTrigger;
}

function eventMatches(trigger, event) {
  if (trigger.event !== '*' && trigger.event !== event.type) return false;

  const provider = (trigger.provider || ANY).toLowerCase();
  if (provider !== ANY && provider !== (event.provider || '').toLowerCase()) return false;

  const patterns = (trigger.paths || []).map((p) => p.trim()).filter(Boolean);
  if (!patterns.length) return true;

  const paths = eventPaths(event);
  if (!paths.length) return false;

  const regexes = patterns.map(globToRegex);
  return paths.some((p) => regexes.some((re) => re.test(normalizePath(p))));
}

function flowMatchesEvent(flow, event) {
  if (!flow.enabled || !flow.hookTrigger || !isHookFlow(flow)) return false;
  if (!isWithinCwd(normalizeCwd(event.cwd), normalizeCwd(flow.cwd))) return false;
  return eventMatches(flow.hookTrigger, event);
}

function findFlow(flows, target) {
  return flows.find((flow) => flow.id === target || flow.name === target) || null;
}

function debounceKey(flow, event) {
  return [
    flow.id,
    event.type,
    event.provider || ANY,
    normalizeCwd(event.cwd) || '',
  ].join('|');
}

async function readState() {
  return (await readJson(STATE_FILE)) || { debounce: {} };
}

async function shouldDebounce(flow, event, state, now) {
  const seconds = Math.max(0, Number(flow.hookTrigger?.debounceSeconds || 0));
  if (!seconds) return false;
  const key = debounceKey(flow, event);
  const last = state.debounce?.[key] || 0;
  if (now - last < seconds * 1000) return true;
  state.debounce[key] = now;
  return false;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function buildFlowCommand(flow) {
  const agent = flow.agent || 'claude';
  const cfg = AGENT_CONFIG[agent] || AGENT_CONFIG.claude;
  const parts = [agent];
  if (cfg.permModes) parts.push(cfg.permModes[flow.dangerouslySkipPermissions ? 1 : 0]);
  if (cfg.flags) parts.push(cfg.flags);
  if (cfg.promptPrefix) parts.push(cfg.promptPrefix);
  parts.push(shellQuote(flow.prompt));
  return parts.join(' ');
}

function safeCwd(cwd) {
  if (cwd) {
    try {
      if (fs.statSync(cwd).isDirectory()) return cwd;
    } catch {}
  }
  return os.homedir();
}

function writeInitialLog(flowId, runTimestamp, output) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.writeFileSync(logPath(flowId, runTimestamp), output, 'utf-8');
}

function appendLog(flowId, runTimestamp, data) {
  try {
    fs.appendFileSync(logPath(flowId, runTimestamp), data, 'utf-8');
  } catch (err) {
    process.stderr.write(`[iaflow-hook] failed to append log: ${err.message}\n`);
  }
}

async function beginRun(flowId, runTimestamp) {
  const flow = await readJson(flowPath(flowId));
  if (!flow) return;
  const now = new Date().toISOString();
  const runs = flow.runs || [];
  runs.push({
    date: now.slice(0, 10),
    timestamp: now,
    logTimestamp: runTimestamp,
    status: 'running',
  });
  flow.runs = runs.length > MAX_RUN_HISTORY ? runs.slice(-MAX_RUN_HISTORY) : runs;
  flow.updatedAt = now;
  await writeJson(flowPath(flowId), flow);
}

async function finishRun(flowId, status, runTimestamp) {
  const flow = await readJson(flowPath(flowId));
  if (!flow) return;
  const now = new Date().toISOString();
  const runs = flow.runs || [];
  const idx = runs.findIndex((run) => run.logTimestamp === runTimestamp);
  if (idx >= 0) {
    runs[idx] = {
      ...runs[idx],
      date: now.slice(0, 10),
      timestamp: now,
      status,
    };
  } else {
    runs.push({
      date: now.slice(0, 10),
      timestamp: now,
      logTimestamp: runTimestamp,
      status,
    });
  }
  flow.runs = runs.length > MAX_RUN_HISTORY ? runs.slice(-MAX_RUN_HISTORY) : runs;
  flow.updatedAt = now;
  await writeJson(flowPath(flowId), flow);
}

async function runCommand(flow, event) {
  const cwd = safeCwd(event.cwd || flow.cwd);
  const runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const command = buildFlowCommand(flow);
  const initialOutput = [
    `IAFlow headless run`,
    `flow: ${flow.name} (${flow.id})`,
    `cwd: ${cwd}`,
    `event: ${JSON.stringify(event)}`,
    '',
  ].join('\n');

  writeInitialLog(flow.id, runTimestamp, initialOutput);
  await beginRun(flow.id, runTimestamp);

  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });

    const timeout = setTimeout(() => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch {}
    }, MAX_FLOW_RUNTIME_MS);

    child.stdout.on('data', (data) => {
      process.stdout.write(data);
      appendLog(flow.id, runTimestamp, data.toString());
    });
    child.stderr.on('data', (data) => {
      process.stderr.write(data);
      appendLog(flow.id, runTimestamp, data.toString());
    });
    child.on('error', (err) => {
      const msg = `\n[iaflow-hook] failed to start: ${err.message}\n`;
      appendLog(flow.id, runTimestamp, msg);
      process.stderr.write(msg);
    });
    child.on('close', async (code) => {
      clearTimeout(timeout);
      const status = code === 0 ? 'success' : 'error';
      appendLog(flow.id, runTimestamp, `\n[iaflow-hook] exit code: ${code ?? 'unknown'}\n`);
      try {
        await finishRun(flow.id, status, runTimestamp);
      } catch (err) {
        process.stderr.write(`[iaflow-hook] failed to record run: ${err.message}\n`);
      }
      resolve({ flowId: flow.id, flowName: flow.name, exitCode: code ?? 1, status });
    });
  });
}

function toEvent(options) {
  return {
    type: options.eventType,
    provider: options.provider,
    cwd: options.cwd,
    paths: options.paths,
    tool: options.tool || undefined,
    payload: options.payload,
  };
}

async function main() {
  const options = await parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }

  const flows = await listFlows();
  const event = toEvent(options);
  let matched = [];
  let skipped = [];

  if (options.mode === 'run') {
    const flow = findFlow(flows, options.targetFlow);
    if (!flow) throw new Error(`Flow not found: ${options.targetFlow}`);
    matched = [flow];
  } else {
    matched = flows.filter((flow) => flowMatchesEvent(flow, event));
    if (options.targetFlow) {
      matched = matched.filter((flow) => flow.id === options.targetFlow || flow.name === options.targetFlow);
    }

    const state = await readState();
    const now = Date.now();
    const runnable = [];
    for (const flow of matched) {
      if (await shouldDebounce(flow, event, state, now)) {
        skipped.push({ flowId: flow.id, flowName: flow.name, reason: 'debounce' });
      } else {
        runnable.push(flow);
      }
    }
    matched = runnable;
    if (!options.dryRun) await writeJson(STATE_FILE, state);
  }

  if (options.dryRun) {
    const summary = {
      event,
      matched: matched.map((flow) => ({ id: flow.id, name: flow.name })),
      skipped,
    };
    if (options.json) console.log(JSON.stringify(summary, null, 2));
    else {
      console.log(`Matched ${summary.matched.length} flow(s).`);
      for (const flow of summary.matched) console.log(`- ${flow.name} (${flow.id})`);
      for (const item of skipped) console.log(`- skipped ${item.flowName} (${item.reason})`);
    }
    return 0;
  }

  if (!matched.length) {
    if (options.json) console.log(JSON.stringify({ event, matched: [], skipped }, null, 2));
    else console.log('No matching IAFlow flows.');
    return 0;
  }

  const results = [];
  for (const flow of matched) {
    process.stderr.write(`[iaflow-hook] running ${flow.name} (${flow.id})\n`);
    results.push(await runCommand(flow, event));
  }

  if (options.json) console.log(JSON.stringify({ event, results, skipped }, null, 2));
  return results.some((result) => result.exitCode !== 0) ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`[iaflow-hook] ${err.message}\n`);
    process.exitCode = 1;
  });
