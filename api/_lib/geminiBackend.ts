import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

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

export function isModelNotFoundError(error: any): boolean {
  const raw = error?.message || (typeof error === 'string' ? error : '');
  const status = error?.status || error?.code || error?.error?.code;
  return (
    status === 404 ||
    status === 'NOT_FOUND' ||
    raw.includes('NOT_FOUND') ||
    raw.includes('is not found for API version')
  );
}

export function parseGeminiError(error: any): {
  message: string;
  isKeyError: boolean;
  isTransientError: boolean;
} {
  const raw = error?.message || (typeof error === 'string' ? error : '');
  const status = error?.status || error?.code || error?.error?.code;

  let isKeyError = status === 403 || status === 'PERMISSION_DENIED';
  let isTransientError = !!error?.isTransientError || status === 503 || status === 429;
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
    raw.includes('timed out') ||
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
      message: 'Gemini AI is currently experiencing high demand. Please click "Retry Scanning Now" in a few moments, or enter courses manually.',
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

const DAY_MAP: Record<string, string> = {
  m: 'Monday',
  mon: 'Monday',
  monday: 'Monday',
  t: 'Tuesday',
  tu: 'Tuesday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  tuesday: 'Tuesday',
  w: 'Wednesday',
  wed: 'Wednesday',
  wednesday: 'Wednesday',
  r: 'Thursday',
  th: 'Thursday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  thursday: 'Thursday',
  f: 'Friday',
  fri: 'Friday',
  friday: 'Friday',
  s: 'Saturday',
  sa: 'Saturday',
  sat: 'Saturday',
  saturday: 'Saturday',
  u: 'Sunday',
  su: 'Sunday',
  sun: 'Sunday',
  sunday: 'Sunday',
};

function normalizeDay(dayRaw: string): string | null {
  if (!dayRaw || typeof dayRaw !== 'string') return null;
  const cleaned = dayRaw.trim().toLowerCase();
  if (DAY_MAP[cleaned]) return DAY_MAP[cleaned];
  const exact = DayEnumValues.find((d) => d.toLowerCase() === cleaned);
  return exact || null;
}

function normalizeTime(timeRaw: string): string | null {
  if (!timeRaw || typeof timeRaw !== 'string') return null;
  const cleaned = timeRaw.trim().toUpperCase();
  const match = cleaned.match(/^(\d{1,2})[:.](\d{2})(?:\s*(AM|PM))?$/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const period = match[3];

  if (period === 'PM' && hour < 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function normalizeExtractedCourses(rawData: any, courseNameHint?: string): any[] {
  let list: any[] = [];
  if (Array.isArray(rawData)) {
    list = rawData;
  } else if (rawData && Array.isArray(rawData.courses)) {
    list = rawData.courses;
  }

  const stamp = Date.now();
  return list
    .map((course: any, ci: number) => {
      const rawName = typeof course?.name === 'string' ? course.name.trim() : '';
      const resolvedName =
        rawName && rawName.toLowerCase() !== 'unknown'
          ? rawName
          : courseNameHint?.trim() || `Course ${ci + 1}`;

      const rawSections = Array.isArray(course?.sections) ? course.sections : [];
      const sections = rawSections
        .map((sec: any, si: number) => {
          const rawSlots = Array.isArray(sec?.slots) ? sec.slots : [];
          const slots = rawSlots
            .map((slot: any) => {
              const day = normalizeDay(slot?.day);
              const startTime = normalizeTime(slot?.startTime);
              const endTime = normalizeTime(slot?.endTime);
              if (!day || !startTime || !endTime) return null;
              return { day, startTime, endTime };
            })
            .filter(Boolean);

          if (slots.length === 0) return null;
          return {
            id: typeof sec?.id === 'string' && sec.id.trim() ? sec.id.trim() : `sec-${stamp}-${ci}-${si}`,
            name: typeof sec?.name === 'string' && sec.name.trim() ? sec.name.trim() : `Section ${si + 1}`,
            slots,
          };
        })
        .filter(Boolean);

      if (sections.length === 0) return null;
      return {
        id: typeof course?.id === 'string' && course.id.trim() ? course.id.trim() : `course-${stamp}-${ci}`,
        name: resolvedName,
        color: '',
        sections,
      };
    })
    .filter(Boolean);
}

export interface ExtractResult {
  courses: any[];
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
Extract EVERY course, section, and class time slot shown in these uploaded timetable screenshot(s).
${courseNameHint ? `The user indicated the course name is: "${courseNameHint}".` : ''}

Instructions:
1. Read all rows, columns, tables, or calendar blocks accurately from the image(s).
2. A single course often lists multiple sections (e.g., "Section A", "Section 01", "LEC 1", "L1", "CRN 12345", "Lab 02", "Tut 1"). Extract ALL sections visible in the screenshots — do NOT summarize or invent sections that are not in the image.
3. Expand abbreviated days into full English day names:
   - M / Mon -> Monday
   - T / Tu / Tue / Tues -> Tuesday
   - W / Wed -> Wednesday
   - R / Th / Thu / Thur / Thurs -> Thursday
   - F / Fri -> Friday
   - S / Sa / Sat -> Saturday
   - U / Su / Sun -> Sunday
   If a section meets on multiple days (e.g., "MWF 10:00-10:50" or "TuTh 1:30 PM - 2:45 PM"), emit a separate TimeSlot entry for each day with the exact timings.
4. Convert all startTime and endTime values into strict 24-hour "HH:mm" format (e.g., "1:30 PM" -> "13:30", "9:05 AM" -> "09:05").

Return a JSON array of courses. Each Course object must contain:
- id: unique string
- name: course title or code ${courseNameHint ? `(use "${courseNameHint}" if not clearly shown in the image)` : ''}
- color: ""
- sections: array of Section objects, each with:
  - id: unique string
  - name: exact section identifier from the image
  - slots: array of TimeSlot objects ({ day, startTime, endTime })
`;

  const responseSchema = {
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
  };

  const ai = getAiClient();

  const callModel = async (
    model: string,
    timeoutMs: number,
    thinkingLevel?: ThinkingLevel
  ) => {
    const config: any = {
      systemInstruction:
        'You are a precision academic timetable OCR parser. Extract the exact courses, section identifiers, days, and 24-hour timings visible in the provided screenshot images into valid JSON.',
      responseMimeType: 'application/json',
      responseSchema,
    };
    if (thinkingLevel) {
      config.thinkingConfig = { thinkingLevel };
    }

    const generatePromise = ai.models.generateContent({
      model,
      contents: {
        parts: [...imageParts, { text: prompt }],
      },
      config,
    });

    return await Promise.race([
      generatePromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('AI generation timed out due to temporary high demand')),
          timeoutMs
        )
      ),
    ]);
  };

  let response: any = null;
  let lastError: any = null;

  // Primary attempt: gemini-4-hydrogen with LOW thinking for fast & accurate vision OCR
  try {
    response = await callModel('gemini-4-hydrogen', 25000, ThinkingLevel.LOW);
  } catch (err: any) {
    lastError = err;
    if (isTransientGeminiError(err) || isModelNotFoundError(err)) {
      console.log('[Notice] Primary model unavailable/slow; retrying with gemini-3.1-flash-lite.');
      try {
        response = await callModel('gemini-3.1-flash-lite', 20000);
        lastError = null;
      } catch (fallbackErr: any) {
        lastError = fallbackErr;
      }
    }
  }

  if (lastError) {
    if (isTransientGeminiError(lastError)) {
      const transientErr: any = new Error(
        'Gemini AI is currently experiencing high demand. Please click "Retry Scanning Now" in a moment, or enter your course manually.'
      );
      transientErr.isTransientError = true;
      transientErr.statusCode = 503;
      throw transientErr;
    }
    throw lastError;
  }

  const rawText = (response?.text || '[]').trim();
  const cleanedText = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsedRaw: any;
  try {
    parsedRaw = JSON.parse(cleanedText || '[]');
  } catch {
    throw new Error('Could not parse timetable structure from the uploaded image(s). Please try a clearer screenshot.');
  }

  const normalizedCourses = normalizeExtractedCourses(parsedRaw, courseNameHint);
  if (normalizedCourses.length === 0) {
    const emptyErr: any = new Error(
      'No course sections or class timings could be read from the uploaded image(s). Please upload a clearer screenshot or enter the sections manually.'
    );
    emptyErr.statusCode = 422;
    throw emptyErr;
  }

  return { courses: normalizedCourses };
}
