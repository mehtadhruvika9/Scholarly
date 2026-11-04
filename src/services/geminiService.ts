import { Course } from "../types";

export async function extractCoursesFromImages(
  images: { data: string; mimeType: string }[],
  courseNameHint?: string
): Promise<Course[]> {
  const response = await fetch("/api/courses/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      images,
      courseNameHint,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Server error (${response.status})`;
    try {
      const errorData = await response.json();
      if (errorData?.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // Use fallback error message
    }
    throw new Error(errorMessage);
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
