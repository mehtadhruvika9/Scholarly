import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({
  apiKey: apiKey || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

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
  const PORT = Number(process.env.PORT) || 3000;

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

      if (!process.env.GEMINI_API_KEY) {
        res.status(500).json({
          error: 'Gemini API key is not configured on the server. Please check Settings > Secrets.',
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

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [...imageParts, { text: prompt }],
        },
        config: {
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

      const text = response.text || '[]';
      const parsedCourses = JSON.parse(text);

      res.json({ courses: parsedCourses });
    } catch (error: any) {
      console.error('Error in /api/courses/extract:', error);
      res.status(500).json({
        error: error.message || 'Failed to extract course timetable data with Gemini.',
      });
    }
  });

  // Streaming endpoint for any future or dynamic streaming requests
  app.post('/api/gemini/stream', async (req: Request, res: Response): Promise<void> => {
    try {
      const { prompt, model = 'gemini-3.8-flash' } = req.body;
      if (!prompt) {
        res.status(400).json({ error: 'Prompt is required.' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

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
      console.error('Error in /api/gemini/stream:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || 'Streaming failed.' });
      } else {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    }
  });

  // In production, serve the built Vite app; in dev, mount Vite middleware
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
