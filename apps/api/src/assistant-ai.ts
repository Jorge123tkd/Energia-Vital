import { Env } from './types';
import { AssistantContext, buildSystemPrompt } from './assistant-engine';

export interface AIResult {
  text: string;
  provider: 'workers-ai' | 'openai-compatible' | 'none';
  model?: string;
}

/**
 * Llama al proveedor de IA configurado.
 *
 * Orden de preferencia:
 *  1. Workers AI (binding `AI`) si `WORKERS_AI_ENABLED` no está en 'false'.
 *  2. API compatible con OpenAI si hay `AI_API_KEY` + `AI_API_BASE`.
 *
 * Devuelve `provider: 'none'` si no hay proveedor disponible o si la llamada
 * falla, de modo que el llamador pueda recurrir al motor determinista.
 */
export async function callAI(
  env: Env,
  ctx: AssistantContext,
  history: { role: string; content: string }[],
  userMessage: string
): Promise<AIResult> {
  const systemPrompt = buildSystemPrompt(ctx);

  // 1) Workers AI
  const workersAiEnabled = (env.WORKERS_AI_ENABLED || '').toLowerCase() !== 'false';
  if (env.AI && workersAiEnabled) {
    try {
      const model = env.WORKERS_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: userMessage },
      ];
      const result: any = await env.AI.run(model, { messages, max_tokens: 512 });
      const text = extractWorkersAIText(result);
      if (text) return { text, provider: 'workers-ai', model };
    } catch (e) {
      console.error('Workers AI falló, se usará el motor determinista:', e);
    }
  }

  // 2) API compatible con OpenAI
  if (env.AI_API_KEY && env.AI_API_BASE) {
    try {
      const model = env.AI_MODEL || 'gpt-4o-mini';
      const res = await fetch(`${env.AI_API_BASE.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.AI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
            { role: 'user', content: userMessage },
          ],
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (typeof text === 'string' && text.trim()) {
          return { text: text.trim(), provider: 'openai-compatible', model };
        }
      } else {
        console.error('Proveedor de IA respondió con error:', res.status);
      }
    } catch (e) {
      console.error('Fallo al llamar al proveedor de IA:', e);
    }
  }

  return { text: '', provider: 'none' };
}

/** Normaliza la respuesta de Workers AI (text o response[0].response). */
function extractWorkersAIText(result: any): string {
  if (!result) return '';
  if (typeof result === 'string') return result.trim();
  if (typeof result.response === 'string') return result.response.trim();
  if (Array.isArray(result.response) && result.response.length > 0) {
    const first = result.response[0];
    if (typeof first === 'string') return first.trim();
    if (first && typeof first.response === 'string') return first.response.trim();
  }
  return '';
}
