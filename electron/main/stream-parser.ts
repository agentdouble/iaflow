const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const ANSI_RE = /\x1b\[[\d;?]*[a-zA-Z~]|\x1b\][^\x07]*\x07|\x1b[()][B012]/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

interface ToolBlock {
  name: string;
  input?: Record<string, unknown>;
}

const TOOL_CONFIG: Record<string, { color: string; detail: (i: any) => string }> = {
  Read: { color: '\x1b[36m', detail: (i) => i.file_path || '' },
  Edit: { color: '\x1b[33m', detail: (i) => i.file_path || '' },
  Write: { color: '\x1b[32m', detail: (i) => i.file_path || '' },
  Bash: { color: '\x1b[35m', detail: (i) => (i.command || '').split('\n')[0].slice(0, 120) },
  Grep: { color: '\x1b[36m', detail: (i) => `"${i.pattern || ''}"${i.path ? ` in ${i.path}` : ''}` },
  Glob: { color: '\x1b[36m', detail: (i) => i.pattern || '' },
  Agent: { color: '\x1b[34m', detail: () => '' },
};

function formatToolUse(block: ToolBlock): string {
  const cfg = TOOL_CONFIG[block.name];
  const color = cfg?.color || '\x1b[36m';
  const detail = cfg?.detail(block.input || {}) ?? '';
  return `\r\n${color}${BOLD}[${block.name}]${RESET} ${DIM}${detail}${RESET}\r\n`;
}

function formatAssistant(message: any): string {
  if (!message?.content) return '';
  return message.content.reduce((out: string, block: any) => {
    if (block.type === 'text') {
      return out + (block.text ? `\r\n${block.text.replace(/\n/g, '\r\n')}\r\n` : '');
    }
    if (block.type === 'tool_use') {
      return out + formatToolUse(block);
    }
    return out;
  }, '');
}

function formatResult(event: any): string {
  const isSuccess = event.subtype === 'success';
  const color = isSuccess ? '\x1b[32m' : '\x1b[31m';
  const label = isSuccess ? 'Terminé' : 'Erreur';
  const stats: string[] = [];
  if (event.cost_usd != null) stats.push(`$${event.cost_usd.toFixed(4)}`);
  if (event.duration_ms != null) stats.push(`${(event.duration_ms / 1000).toFixed(1)}s`);

  let line = `\r\n${BOLD}${color}── ${label}`;
  if (stats.length) line += ` | ${stats.join(' | ')}`;
  line += ` ──${RESET}\r\n`;

  if (event.result) line += `\r\n${event.result.replace(/\n/g, '\r\n')}\r\n`;
  return line;
}

function formatEvent(event: any): string {
  if (event.type === 'assistant') return formatAssistant(event.message);
  if (event.type === 'result') return formatResult(event);
  return '';
}

export interface StreamParser {
  hasEvents(): boolean;
  push(rawData: string): string;
  flush(): string;
}

export function createStreamParser(): StreamParser {
  let buffer = '';
  let hasEvents = false;

  return {
    hasEvents: () => hasEvents,
    push(rawData: string) {
      buffer += rawData;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let output = '';
      for (const line of lines) {
        const trimmed = stripAnsi(line.replace(/\r$/, '')).trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          if (event.type) {
            hasEvents = true;
            output += formatEvent(event);
          }
        } catch {
          if (hasEvents) output += trimmed + '\r\n';
        }
      }
      return output;
    },
    flush() {
      const rest = stripAnsi(buffer).trim();
      buffer = '';
      if (!rest) return '';
      try {
        const event = JSON.parse(rest);
        if (event.type) {
          hasEvents = true;
          return formatEvent(event);
        }
      } catch {}
      return hasEvents ? rest + '\r\n' : '';
    },
  };
}

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export interface OutputProcessor {
  processData(data: string): string;
  flush(): string;
  getOutput(): string;
}

export function createOutputProcessor(agent: string): OutputProcessor {
  const parser = (agent || 'claude') === 'claude' ? createStreamParser() : null;
  let outputBuffer = '';
  let rawBuffer = '';
  let truncated = false;

  function append(target: 'out' | 'raw', s: string) {
    if (truncated) return;
    const buf = target === 'out' ? outputBuffer : rawBuffer;
    if (buf.length + s.length > MAX_OUTPUT_BYTES) {
      if (target === 'out') outputBuffer = buf.slice(0, MAX_OUTPUT_BYTES);
      else rawBuffer = buf.slice(0, MAX_OUTPUT_BYTES);
      truncated = true;
      return;
    }
    if (target === 'out') outputBuffer += s;
    else rawBuffer += s;
  }

  return {
    processData(data: string) {
      if (!parser) {
        append('out', data);
        return data;
      }
      append('raw', data);
      const formatted = parser.push(data);
      if (formatted) append('out', formatted);
      return formatted || '';
    },
    flush() {
      if (!parser) return '';
      const remaining = parser.flush();
      if (remaining) {
        append('out', remaining);
        return remaining;
      }
      if (!parser.hasEvents() && rawBuffer) {
        outputBuffer = rawBuffer;
        return rawBuffer;
      }
      return '';
    },
    getOutput() {
      return truncated ? outputBuffer + '\n[output truncated at 10 MB]' : outputBuffer;
    },
  };
}
