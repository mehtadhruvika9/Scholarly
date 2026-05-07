import { GoogleGenAI, Type } from "@google/genai";
import { Course, Day } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export async function extractCoursesFromImages(images: { data: string; mimeType: string }[], courseNameHint?: string): Promise<Course[]> {
  const model = "gemini-3-flash-preview";

  const imageParts = images.map(img => ({
    inlineData: {
      data: img.data.split(",")[1], // Remove "data:image/png;base64," prefix
      mimeType: img.mimeType,
    },
  }));

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
    model,
    contents: {
      parts: [
        ...imageParts,
        { text: prompt }
      ],
    },
    config: {
      responseMimeType: "application/json",
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
                          enum: Object.values(Day)
                        },
                        startTime: { type: Type.STRING },
                        endTime: { type: Type.STRING },
                      },
                      required: ["day", "startTime", "endTime"]
                    }
                  }
                },
                required: ["id", "name", "slots"]
              }
            }
          },
          required: ["id", "name", "sections"]
        }
      }
    }
  });

  try {
    const rawData = JSON.parse(response.text);
    return rawData as Course[];
  } catch (error) {
    console.error("Failed to parse Gemini response", error);
    throw new Error("AI failed to extract schedule data. Please check image quality.");
  }
}
