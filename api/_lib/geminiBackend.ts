import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

// Initialize dotenv if in local development
try {
  dotenv.config();
} catch {
  // ignore
}

export function getApiKey(): string | undefined {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const parsed = dotenv.parse(fs.readFileSync(envPath));
      if (parsed.GEMINI_API_KEY) {
        return parsed.GEMINI_API_KEY;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function getAiClient(): GoogleGenAI {
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

export function isTransientGeminiError(error: any): boolean {
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

export function parseGeminiError(error: any): {
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
      message: 'Your API key was reported as leaked or invalid. Please configure a valid GEMINI_API_KEY.',
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

export const DayEnumValues = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export interface ExtractResult {
  courses: any[];
  fallbackNotice?: string;
}

export async function extractCoursesCore(payload: {
  images: { data: string; mimeType?: string }[];
  courseNameHint?: string;
}): Promise<ExtractResult> {
  const { images, courseNameHint } = payload;

  if (!images || !Array.isArray(images) || images.length === 0) {
    throw new Error('At least one image is required.');
  }

  const activeApiKey = getApiKey();
  if (!activeApiKey) {
    const err: any = new Error('Gemini API key is not configured on the server. Please check your environment variables.');
    err.isKeyError = true;
    err.statusCode = 500;
    throw err;
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

    // Enforce 8.5 second timeout to stay well within serverless function limits
    response = await Promise.race([
      generatePromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI generation timed out due to temporary high demand')), 8500)
      ),
    ]);

    const text = response.text || '[]';
    const parsedCourses = JSON.parse(text);
    return { courses: parsedCourses };
  } catch (err: any) {
    if (isTransientGeminiError(err)) {
      console.log('[Notice] AI call slow/high-demand. Instantly drafting fallback course.');
      const fallbackName = courseNameHint?.trim() || 'Imported Course';
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

      return {
        courses: [fallbackCourse],
        fallbackNotice: 'AI models are at temporary peak capacity. We drafted initial sections for you to review and edit.'
      };
    }
    throw err;
  }
}
