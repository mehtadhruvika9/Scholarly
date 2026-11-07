import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  getApiKey,
  getAiClient,
  parseGeminiError,
  extractCoursesCore,
} from './api/_lib/geminiBackend.js';

async function startServer() {
  const app = express();
  // AI Studio requires the applet server to bind to port 3000 behind nginx (which listens on 8080)
  const PORT = 3000;

  // CORS headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Middleware to parse large JSON payloads for uploaded timetable images
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API health check
  app.get(['/api/courses/extract', '/api/courses/extract/'], (_req: Request, res: Response): void => {
    res.json({ status: 'ready', message: 'Course extraction endpoint is active.' });
  });

  // API endpoint for extracting courses from timetable images
  app.post(['/api/courses/extract', '/api/courses/extract/'], async (req: Request, res: Response): Promise<void> => {
    try {
      const { images, courseNameHint } = req.body || {};

      if (!images || !Array.isArray(images) || images.length === 0) {
        res.status(400).json({ error: 'At least one image is required.' });
        return;
      }

      const result = await extractCoursesCore({
        images,
        courseNameHint,
      });

      res.status(200).json(result);
    } catch (error: any) {
      const { message: friendlyError, isKeyError, isTransientError } = parseGeminiError(error);
      if (isKeyError) {
        console.log('[Notice] Gemini API key revoked or invalid.');
        res.status(403).json({
          error: friendlyError,
          isKeyError: true,
          isTransientError: false,
        });
        return;
      }
      const statusCode = error?.statusCode || 500;
      res.status(statusCode).json({
        error: friendlyError,
        isKeyError: false,
        isTransientError,
      });
    }
  });

  // Streaming endpoint for any future or dynamic streaming requests
  app.post('/api/gemini/stream', async (req: Request, res: Response): Promise<void> => {
    try {
      const { prompt, model = 'gemini-flash-latest' } = req.body;
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
  });

  // Ensure unhandled API routes return JSON 404 rather than HTML
  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // In production, serve the built Vite app; in dev, mount Vite middleware + SPA fallback
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req: Request, res: Response, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
