import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAiClient, parseGeminiError } from '../_lib/geminiBackend.js';

export const config = {
  maxDuration: 60,
};

function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({ status: 'ready', message: 'Gemini stream endpoint is active.' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { prompt, model = 'gemini-flash-latest' } = req.body || {};
    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const ai = getAiClient();
    const responseStream = await ai.models.generateContentStream({
      model,
      contents: prompt,
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    const { message: friendlyError, isKeyError } = parseGeminiError(error);
    console.log('[Notice] /api/gemini/stream:', friendlyError);
    const statusCode = isKeyError ? 403 : 500;
    if (!res.headersSent) {
      res.status(statusCode).json({ error: friendlyError, isKeyError });
    } else {
      res.write(`data: ${JSON.stringify({ error: friendlyError, isKeyError })}\n\n`);
      res.end();
    }
  }
}
