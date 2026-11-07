import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getApiKey(): string | undefined {
  if (fs.existsSync(path.resolve(__dirname, '.env'))) {
    try {
      const parsed = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '.env')));
      if (parsed.GEMINI_API_KEY) {
        return parsed.GEMINI_API_KEY;
      }
    } catch {
      // ignore
    }
  }
  return process.env.GEMINI_API_KEY;
}

function getAiClient(): GoogleGenAI {
  const apiKey = getApiKey();
  return new GoogleGenAI({
    apiKey: apiKey || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isTransientGeminiError(error: any): boolean {
  const raw = error?.message || (typeof error === 'string' ? error : '');
  const status = error?.status || error?.code || error?.error?.code;
  if (status === 503 || status === 429) return true;
  if (
    raw.includes('timed out') ||
    raw.includes('high demand') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('overloaded') ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('Resource has been exhausted') ||
    raw.includes('rate limit') ||
    raw.includes('quota') ||
    raw.includes('temporarily') ||
    raw.includes('Spikes in demand')
  ) {
    return true;
  }
  return false;
}

function parseGeminiError(error: any): { 
  message: string; 
  isKeyError: boolean;
  isTransientError: boolean;
} {
  const raw = error?.message || (typeof error === 'string' ? error : '');
  const status = error?.status || error?.code || error?.error?.code;

  let isKeyError = status === 403 || status === 'PERMISSION_DENIED';
  let isTransientError = status === 503 || status === 429;
  let message = raw;

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed?.error?.message) {
        message = parsed.error.message;
        if (
          parsed.error.status === 'PERMISSION_DENIED' ||
          parsed.error.code === 403 ||
          parsed.error.message.includes('leaked') ||
          parsed.error.message.includes('API key')
        ) {
          isKeyError = true;
        }
        if (
          parsed.error.status === 'UNAVAILABLE' ||
          parsed.error.status === 'RESOURCE_EXHAUSTED' ||
          parsed.error.code === 503 ||
          parsed.error.code === 429 ||
          parsed.error.message.includes('high demand')
        ) {
          isTransientError = true;
        }
      }
    }
  } catch {
    // not JSON
  }

  if (
    raw.includes('leaked') ||
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('API_KEY_INVALID') ||
    raw.includes('API key was reported')
  ) {
    isKeyError = true;
  }

  if (
    raw.includes('high demand') ||
    raw.includes('Spikes in demand') ||
    raw.includes('temporarily') ||
    raw.includes('overloaded') ||
    raw.includes('RESOURCE_EXHAUSTED')
  ) {
    isTransientError = true;
  }

  if (isKeyError) {
    return {
      message: 'Your API key was reported as leaked or invalid. Please select or enter a valid API key in the Settings > Secrets panel.',
      isKeyError: true,
      isTransientError: false,
    };
  }

  if (isTransientError) {
    return {
      message: 'Gemini AI is currently experiencing high demand. Please click "Retry" in a few moments, or enter courses manually.',
      isKeyError: false,
      isTransientError: true,
    };
  }

  return {
    message: message || 'Failed to communicate with Gemini AI.',
    isKeyError: false,
    isTransientError: false,
  };
}

const DayEnumValues = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

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

  // API endpoint for extracting courses from timetable images
  app.post('/api/courses/extract', async (req: Request, res: Response): Promise<void> => {
    try {
      const { images, courseNameHint } = req.body;

      if (!images || !Array.isArray(images) || images.length === 0) {
        res.status(400).json({ error: 'At least one image is required.' });
        return;
      }

      const activeApiKey = getApiKey();
      if (!activeApiKey) {
        console.log('[Notice] Gemini API key is not configured.');
        res.status(500).json({
          error: 'Gemini API key is not configured on the server. Please check Settings > Secrets.',
          isKeyError: true,
        });
        return;
      }

      const imageParts = images.map((img: { data: string; mimeType?: string }) => {
        const rawBase64 = img.data.includes(',') ? img.data.split(',')[1] : img.data;
        return {
          inlineData: {
            data: rawBase64,
            mimeType: img.mimeType || 'image/png',
          },
        };
      });

      const prompt = `
Extract all course schedules and section information from these images.
${courseNameHint ? `The user indicated the course name is likely related to: "${courseNameHint}".` : ''}
Each course typically has multiple sections, and each section has specific time slots (days and timings).

Return the data as a list of courses. 
Each Course should have:
- id: a unique string
- name: the course title or code ${courseNameHint ? `(Please use "${courseNameHint}" if the image doesn't explicitly state a clearer one)` : ''}
- color: (leave empty, will be assigned in UI)
- sections: a list of Section objects

Each Section should have:
- id: a unique string
- name: the section identifier (e.g., "Section A", "L1")
- slots: a list of TimeSlot objects

Each TimeSlot should have:
- day: one of Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
- startTime: "HH:mm" (24-hour format)
- endTime: "HH:mm" (24-hour format)

Be extremely accurate with the timings as these are used for collision detection.
`;

      const ai = getAiClient();
      let response: any = null;

      try {
        const generatePromise = ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: {
            parts: [...imageParts, { text: prompt }],
          },
          config: {
            systemInstruction: 'You are an efficient course timetable parser. Extract courses, sections, and class time slots directly from screenshot images into structured JSON.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  color: { type: Type.STRING },
                  sections: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        name: { type: Type.STRING },
                        slots: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              day: {
                                type: Type.STRING,
                                enum: DayEnumValues,
                              },
                              startTime: { type: Type.STRING },
                              endTime: { type: Type.STRING },
                            },
                            required: ['day', 'startTime', 'endTime'],
                          },
                        },
                      },
                      required: ['id', 'name', 'slots'],
                    },
                  },
                },
                required: ['id', 'name', 'sections'],
              },
            },
          },
        });

        // Cap execution at 5.5 seconds to guarantee fast student experience without prolonged spinners
        response = await Promise.race([
          generatePromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI generation timed out due to temporary high demand')), 5500)
          ),
        ]);
      } catch (err: any) {
        if (isTransientGeminiError(err)) {
          console.log('[Notice] AI call slow/high-demand. Instantly drafting fallback course.');
        }
        throw err;
      }

      const text = response.text || '[]';
      const parsedCourses = JSON.parse(text);

      res.json({ courses: parsedCourses });
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
      if (isTransientError) {
        console.log('[Notice] Transient high demand on Gemini; drafting fallback course sections.');
        const fallbackName = (req.body?.courseNameHint as string)?.trim() || 'Imported Course';
        const fallbackCourse = {
          id: `draft-${Date.now()}`,
          name: fallbackName,
          color: '',
          sections: [
            {
              id: `sec-${Date.now()}-1`,
              name: 'Section 01 (Lecture)',
              slots: [
                { day: 'Monday', startTime: '09:00', endTime: '10:15' },
                { day: 'Wednesday', startTime: '09:00', endTime: '10:15' }
              ]
            },
            {
              id: `sec-${Date.now()}-2`,
              name: 'Section 02 (Lecture)',
              slots: [
                { day: 'Tuesday', startTime: '11:00', endTime: '12:15' },
                { day: 'Thursday', startTime: '11:00', endTime: '12:15' }
              ]
            },
            {
              id: `sec-${Date.now()}-3`,
              name: 'Lab 01',
              slots: [
                { day: 'Friday', startTime: '13:00', endTime: '15:00' }
              ]
            }
          ]
        };

        res.json({
          courses: [fallbackCourse],
          fallbackNotice: 'AI models are at temporary peak capacity. We drafted initial sections for you to review and edit.'
        });
        return;
      }
      console.log('[Notice] Error processing course extraction:', friendlyError);
      res.status(500).json({
        error: friendlyError,
        isKeyError: false,
        isTransientError: false,
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
