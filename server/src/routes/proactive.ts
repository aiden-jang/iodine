import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { loadApiKey } from '../services/anthropicAgent';
import { loadOpenAIKey } from '../services/openaiAgent';
import { loadGeminiKey } from '../services/geminiAgent';
import { PROACTIVE_REPHRASE_SYSTEM } from '../prompts/proactiveSystem';
import { WATCH_SYSTEM } from '../prompts/watchSystem';

const router = Router();

router.post('/proactive/rephrase', async (req, res) => {
  const { message, provider, model } = req.body as {
    message: string;
    provider: string;
    model: string;
  };

  try {
    let rephrased = message;

    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey: await loadApiKey() });
      const response = await client.messages.create({
        model,
        max_tokens: 120,
        system: PROACTIVE_REPHRASE_SYSTEM,
        messages: [{ role: 'user', content: message }],
      });
      const block = response.content[0];
      if (block?.type === 'text') rephrased = block.text.trim();

    } else if (provider === 'openai') {
      const client = new OpenAI({ apiKey: await loadOpenAIKey() });
      const response = await client.chat.completions.create({
        model,
        max_completion_tokens: 120,
        messages: [
          { role: 'system', content: PROACTIVE_REPHRASE_SYSTEM },
          { role: 'user', content: message },
        ],
      });
      rephrased = response.choices[0]?.message?.content?.trim() ?? message;

    } else if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: await loadGeminiKey() });
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: message }] }],
        config: { systemInstruction: PROACTIVE_REPHRASE_SYSTEM },
      });
      rephrased = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? message;
    }

    res.json({ rephrased });
  } catch {
    // Degrade gracefully — return the original canned message.
    res.json({ rephrased: message });
  }
});

router.post('/proactive/watch', async (req, res) => {
  const { previousReply, diffSnapshots, provider, model } = req.body as {
    previousReply: string;
    diffSnapshots: string[];
    provider: string;
    model: string;
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const SNAPSHOT_TIMES = [4, 10, 20];
  const diffsText = diffSnapshots
    .map((d, i) => {
      const t = SNAPSHOT_TIMES[i] ?? (i + 1) * 10;
      return d.trim()
        ? `Snapshot ${i + 1} (at ${t}s):\n\`\`\`diff\n${d}\n\`\`\``
        : `Snapshot ${i + 1} (at ${t}s): (no changes)`;
    })
    .join('\n\n');

  const userContent =
    `My previous reply:\n---\n${previousReply}\n---\n\nGit diff snapshots:\n${diffsText}`;

  try {
    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey: await loadApiKey() });
      const stream = client.messages.stream({
        model,
        max_tokens: 300,
        system: WATCH_SYSTEM,
        messages: [{ role: 'user', content: userContent }],
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          send('text_delta', { text: event.delta.text });
        }
      }

    } else if (provider === 'openai') {
      const client = new OpenAI({ apiKey: await loadOpenAIKey() });
      const stream = await client.chat.completions.create({
        model,
        max_completion_tokens: 300,
        stream: true,
        messages: [
          { role: 'system', content: WATCH_SYSTEM },
          { role: 'user', content: userContent },
        ],
      });
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) send('text_delta', { text });
      }

    } else if (provider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: await loadGeminiKey() });
      const stream = await ai.models.generateContentStream({
        model,
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        config: { systemInstruction: WATCH_SYSTEM },
      });
      for await (const chunk of stream) {
        const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) send('text_delta', { text });
      }
    }

    send('done', {});
  } catch (err) {
    send('error', { message: err instanceof Error ? err.message : 'Unknown error' });
  } finally {
    res.end();
  }
});

const MEETING_SUMMARY_SYSTEM = `You are a meeting notes assistant. Given the transcript of a voice conversation between a developer and an AI coding assistant, produce clean, concise meeting notes in markdown.

Use this structure (omit a section if there's nothing to put there):

**Overview**
2–3 sentences on the purpose of the meeting and the overall outcome.

**What was Discussed**
- Bullet list of the main topics, including any decisions made and why.

**Next Steps**
- Bullet list of concrete things the AI should implement or follow up on after the meeting.

Be specific — reference actual files, features, or bugs discussed. No filler or generic phrasing. Keep it tight.

Refer to the AI participant as "the assistant", never by a model or vendor name (e.g. Gemini, Claude, GPT), even if the transcript uses one.`;

router.post('/proactive/meeting-summary', async (req, res) => {
  const { transcript, provider, model } = req.body as {
    transcript: string;
    provider: string;
    model: string;
  };

  try {
    let summary = '';

    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey: await loadApiKey() });
      const response = await client.messages.create({
        model,
        max_tokens: 1500,
        system: MEETING_SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: transcript }],
      });
      const textBlock = response.content.find((b) => b.type === 'text');
      if (textBlock?.type === 'text') summary = textBlock.text.trim();
      if (!summary) {
        console.warn('[meeting-summary] anthropic raw', {
          stop_reason: response.stop_reason,
          types: response.content.map((b) => b.type),
        });
      }

    } else if (provider === 'openai') {
      const client = new OpenAI({ apiKey: await loadOpenAIKey() });
      const response = await client.chat.completions.create({
        model,
        max_completion_tokens: 4000,
        messages: [
          { role: 'system', content: MEETING_SUMMARY_SYSTEM },
          { role: 'user', content: transcript },
        ],
      });
      summary = response.choices[0]?.message?.content?.trim() ?? '';

    } else {
      const ai = new GoogleGenAI({ apiKey: await loadGeminiKey() });
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: transcript }] }],
        config: { systemInstruction: MEETING_SUMMARY_SYSTEM },
      });
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      summary = parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join('')
        .trim();
      if (!summary) {
        console.warn('[meeting-summary] gemini raw', {
          finishReason: response.candidates?.[0]?.finishReason,
          partCount: parts.length,
        });
      }
    }

    if (!summary) console.warn('[meeting-summary] model returned empty summary', { provider, model });
    res.json({ summary: summary || null });
  } catch (err) {
    console.error('[meeting-summary] failed', { provider, model }, err);
    res.json({ summary: null });
  }
});

const CONVERSATION_SUMMARY_SYSTEM = `Summarize this conversation in one short phrase of 5–8 words. Focus on the main task or question. No punctuation at the end. No quotes. Examples: "Debugging the auth token refresh flow", "Adding dark mode to the editor", "Explaining the React reconciliation algorithm"`;

router.post('/proactive/conversation-summary', async (req, res) => {
  const { history, provider, model } = req.body as {
    history: { role: 'user' | 'assistant'; content: string }[];
    provider: string;
    model: string;
  };

  const userContent = history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');

  try {
    let summary = '';

    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey: await loadApiKey() });
      const response = await client.messages.create({
        model,
        max_tokens: 200,
        system: CONVERSATION_SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: userContent }],
      });
      summary = response.content
        .flatMap(b => (b.type === 'text' ? [b.text] : []))
        .join('')
        .trim();
      if (!summary) {
        console.warn('[conversation-summary] empty Anthropic response', {
          model,
          stop_reason: response.stop_reason,
          blockTypes: response.content.map(b => b.type),
        });
      }

    } else if (provider === 'openai') {
      const client = new OpenAI({ apiKey: await loadOpenAIKey() });
      const response = await client.chat.completions.create({
        model,
        max_completion_tokens: 40,
        messages: [
          { role: 'system', content: CONVERSATION_SUMMARY_SYSTEM },
          { role: 'user', content: userContent },
        ],
      });
      summary = response.choices[0]?.message?.content?.trim() ?? '';

    } else {
      const ai = new GoogleGenAI({ apiKey: await loadGeminiKey() });
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        config: { systemInstruction: CONVERSATION_SUMMARY_SYSTEM },
      });
      summary = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    }

    res.json({ summary: summary || null });
  } catch (err) {
    console.error('[conversation-summary] failed', { provider, model, err });
    res.json({ summary: null });
  }
});

export default router;
