import axios from 'axios';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function chat(promptOrMessages: string | ChatMessage[], opts?: { model?: string; temperature?: number }) {
  const isArray = Array.isArray(promptOrMessages);
  const payload = isArray
    ? { messages: promptOrMessages, ...(opts || {}) }
    : { prompt: String(promptOrMessages), ...(opts || {}) };

  const { data } = await axios.post('/api/ai/chat', payload);
  return data as { ok: boolean; model: string; content: string; usage?: any };
}
