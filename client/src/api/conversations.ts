import type { UIMessage, HistoryMessage } from '../types';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export interface ConversationRecord {
  id: string;
  timestamp: number;
  history: HistoryMessage[];
  uiMessages: UIMessage[];
  summary?: string;
}

export async function fetchConversations(workspacePath: string): Promise<ConversationRecord[]> {
  const res = await fetch(`${API_BASE}/api/conversations?workspacePath=${encodeURIComponent(workspacePath)}`);
  if (!res.ok) throw new Error(`Failed to load conversations (HTTP ${res.status})`);
  return res.json();
}

export async function saveConversation(workspacePath: string, conv: ConversationRecord): Promise<void> {
  const res = await fetch(`${API_BASE}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspacePath, ...conv }),
  });
  if (!res.ok) throw new Error(`Failed to save conversation (HTTP ${res.status})`);
}

export async function deleteConversation(workspacePath: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(id)}?workspacePath=${encodeURIComponent(workspacePath)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete conversation (HTTP ${res.status})`);
}

export async function clearConversations(workspacePath: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/conversations?workspacePath=${encodeURIComponent(workspacePath)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to clear conversations (HTTP ${res.status})`);
}
