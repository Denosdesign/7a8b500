import { GoogleGenAI, Type } from "@google/genai";
import { ParsedPlayerResponse } from '../types';

export const parseNamesWithGemini = async (rawText: string): Promise<ParsedPlayerResponse | null> => {
  if (!process.env.API_KEY) {
    console.error("API Key not found");
    return null;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Extract a list of names and their genders from the following text. 
      If gender is not explicitly stated, infer it based on the name. 
      If you absolutely cannot infer it, default to 'NB'.
      
      Input Text:
      "${rawText}"
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            players: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  gender: { type: Type.STRING, enum: ['M', 'F', 'NB'] }
                },
                required: ['name', 'gender']
              }
            }
          },
          required: ['players']
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as ParsedPlayerResponse;
    }
    return null;

  } catch (error) {
    console.error("Gemini Parsing Error:", error);
    return null;
  }
};
