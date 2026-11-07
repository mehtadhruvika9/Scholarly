import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractCoursesCore, parseGeminiError } from '../_lib/geminiBackend.ts';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4.5mb',
    },
  },
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

  // Friendly health check endpoint
  if (req.method === 'GET') {
    res.status(200).json({ status: 'ready', message: 'Course extraction endpoint is active.' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

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
}
