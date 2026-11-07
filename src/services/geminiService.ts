import { Course } from "../types";

export interface ExtractCourseError extends Error {
  isKeyError?: boolean;
  isTransientError?: boolean;
}

export async function extractCoursesFromImages(
  images: { data: string; mimeType: string }[],
  courseNameHint?: string
): Promise<Course[]> {
  let response: Response | null = null;
  let networkError: any = null;

  // Attempt up to 2 times to handle transient server warmup or brief route 404 during restarts
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch("/api/courses/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          images,
          courseNameHint,
        }),
      });

      // If server returned 404 or >= 500 on first try, wait 750ms and retry once
      if ((response.status === 404 || response.status >= 500) && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        continue;
      }
      break;
    } catch (err: any) {
      networkError = err;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        continue;
      }
    }
  }

  if (!response) {
    const err: ExtractCourseError = new Error(
      networkError?.message || "Could not connect to the extraction service. Please check your network or retry."
    );
    err.isTransientError = true;
    throw err;
  }

  if (!response.ok) {
    let errorMessage = `Server error (${response.status})`;
    let isKeyError = response.status === 403;
    let isTransientError = response.status === 404 || response.status === 503 || response.status === 429 || response.status >= 500;

    if (response.status === 404) {
      errorMessage = "The extraction service is currently warming up. Please click Retry Scanning Now or enter courses manually.";
    }

    try {
      const errorData = await response.json();
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
      if (errorData?.isKeyError !== undefined) {
        isKeyError = !!errorData.isKeyError;
      }
      if (errorData?.isTransientError !== undefined) {
        isTransientError = !!errorData.isTransientError;
      }
    } catch {
      // Use fallback error message
    }

    const err: ExtractCourseError = new Error(errorMessage);
    err.isKeyError = isKeyError;
    err.isTransientError = isTransientError;
    throw err;
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.courses)) {
    throw new Error("Invalid response format received from server.");
  }

  return data.courses as Course[];
}

/**
 * Helper to call server-side streaming endpoint if needed
 */
export async function streamGemini(
  prompt: string,
  onChunk: (text: string) => void
): Promise<void> {
  const response = await fetch("/api/gemini/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Streaming failed (${response.status})`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body readable");

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") return;
        try {
          const parsed = JSON.parse(raw);
          if (parsed.text) {
            onChunk(parsed.text);
          }
        } catch {
          // Ignore parse errors on malformed lines
        }
      }
    }
  }
}
