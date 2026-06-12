import { useState } from 'react';
import { AgentMonitorView } from './components/AgentMonitorView';
import { FlowView } from './components/FlowView';

type AppTab = 'flows' | 'agents';

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('flows');

  return (
    <div className="iaflow-app">
      <div className="iaflow-titlebar" />
      <nav className="iaflow-tabs" aria-label="Navigation IAFlow">
        <button
          className={activeTab === 'flows' ? 'is-active' : ''}
          type="button"
          onClick={() => setActiveTab('flows')}
        >
          Flows
        </button>
        <button
          className={activeTab === 'agents' ? 'is-active' : ''}
          type="button"
          onClick={() => setActiveTab('agents')}
        >
          Agents
        </button>
      </nav>
      <div className="iaflow-content">
        {activeTab === 'flows' ? <FlowView /> : <AgentMonitorView />}
      </div>
    </div>
  );
}
