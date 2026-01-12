
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const PROMPT_ENGINEER_SYSTEM_INSTRUCTION = `
You are a world-class AI Prompt Engineer. Your task is to take natural, potentially messy human speech describing an AI task and transform it into a highly structured, professional prompt.

FOLLOW THIS STRUCTURE FOR REFINEMENT:
1. Role: Define who the AI should act as.
2. Context: Provide background information.
3. Task: Clearly state the primary objective.
4. Constraints/Guidelines: List specific rules to follow.
5. Examples (if applicable): Provide one or two "Few-Shot" examples.
6. Output Format: Specify the exact structure of the response.

Keep the output professional and ready for use in models like GPT-4, Claude, or Gemini.
`;

export class GeminiService {
  constructor() {}

  async refinePrompt(rawInput: string, useThinking: boolean = false, useFast: boolean = false): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    
    let model = 'gemini-3-pro-preview';
    let config: any = {
      systemInstruction: PROMPT_ENGINEER_SYSTEM_INSTRUCTION,
      temperature: 0.7,
    };

    if (useThinking) {
      model = 'gemini-3-pro-preview';
      config.thinkingConfig = { thinkingBudget: 32768 };
    } else if (useFast) {
      model = 'gemini-2.5-flash-lite-latest';
    }

    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model,
        contents: `Refine this user request into a professional, structured prompt: "${rawInput}"`,
        config,
      });
      return response.text || 'Failed to refine prompt.';
    } catch (error) {
      console.error('Error refining prompt:', error);
      throw error;
    }
  }

  async transcribeOnly(audioBase64: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            inlineData: {
              mimeType: 'audio/pcm;rate=16000',
              data: audioBase64
            }
          },
          { text: "Transcribe this audio accurately. Only return the transcription." }
        ]
      });
      return response.text || '';
    } catch (err) {
      console.error('Transcription error:', err);
      return '';
    }
  }
}

export const gemini = new GeminiService();
