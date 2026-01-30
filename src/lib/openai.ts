import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 15_000, // 15 second timeout for all API calls
  maxRetries: 0, // We handle retries ourselves in errors.ts
});

export default openai;
