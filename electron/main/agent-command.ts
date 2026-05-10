import type { AgentType, Flow } from '../shared/types';

interface AgentConfig {
  permModes?: [string, string];
  flags?: string;
  promptPrefix?: string;
}

const AGENT_CONFIG: Record<AgentType, AgentConfig> = {
  claude: {
    permModes: ['--permission-mode auto', '--dangerously-skip-permissions'],
    flags: '--verbose --output-format stream-json',
    promptPrefix: '-p',
  },
  codex: {
    permModes: ['--approval-mode auto-edit', '--approval-mode full-auto'],
    flags: '--quiet',
  },
  opencode: {
    promptPrefix: '-p',
  },
};

export function buildFlowCommand(flow: Flow): string {
  const escaped = flow.prompt.replace(/'/g, "'\\''");
  const agent = flow.agent || 'claude';
  const cfg = AGENT_CONFIG[agent] || AGENT_CONFIG.claude;
  const skip = !!flow.dangerouslySkipPermissions;
  const parts: string[] = [agent];
  if (cfg.permModes) parts.push(cfg.permModes[skip ? 1 : 0]);
  if (cfg.flags) parts.push(cfg.flags);
  if (cfg.promptPrefix) parts.push(cfg.promptPrefix);
  parts.push(`'${escaped}'`);
  return parts.join(' ') + '; exit\n';
}
