export type AgentState = 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed'

export type Worker = {
  id: string
  parentId?: string
  name?: string
  role: string
  task: string
  status: AgentState
  activity: string
  built: string[]
  steps: number
  startedAt: number
  endedAt?: number
}

export type Chief = { isWorking: boolean; activity: string; built: string[]; steps: number }

export type Board = { chief: Chief; workers: Record<string, Worker> }

/** One agent type the session can assign, whether or not it is working. */
export type RosterEntry = { type: string; description: string; source: string }

export type Roster = Record<string, RosterEntry>

declare module 'claude-code' {
  interface PluginState {
    'agent-board': { board: Shaped<Board>; roster: Shaped<Roster> }
  }
}
