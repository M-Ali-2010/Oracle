import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey: string;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY', '');
    this.model = this.config.get<string>('GEMINI_MODEL', 'gemini-2.0-flash');
  }

  async generateEventIdeas(): Promise<Array<{ title: string; description: string }>> {
    if (!this.apiKey) {
      return [
        {
          title: 'Will SOL close above $200 this week?',
          description: 'AI fallback event generated without external provider.',
        },
      ];
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const prompt = [
        'Generate 3 short crypto prediction event ideas based on trends/news keywords:',
        'BTC ETF, SOL ecosystem, Ethereum upgrades, stablecoin regulation, macro rates.',
        'Return strict JSON array only:',
        '[{"title":"...","description":"..."}]',
      ].join(' ');
      const res = await axios.post(url, {
        contents: [{ parts: [{ text: prompt }] }],
      });
      const text: string = res.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, 3);
    } catch (err: any) {
      this.logger.warn(`Gemini event generation failed: ${err.message}`);
      return [];
    }
  }

  async generateFeedText(context: string): Promise<string> {
    if (!this.apiKey) return `AI update: ${context}`;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const prompt = `Generate one short professional feed line about: ${context}`;
      const res = await axios.post(url, {
        contents: [{ parts: [{ text: prompt }] }],
      });
      return res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || `AI update: ${context}`;
    } catch (err: any) {
      this.logger.warn(`Gemini feed generation failed: ${err.message}`);
      return `AI update: ${context}`;
    }
  }

  async generateVideoPrompt(context: string): Promise<string> {
    if (!this.apiKey) return `Short market explainer video about ${context}`;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const prompt = `Create one short prompt for a 10-second crypto market video: ${context}`;
      const res = await axios.post(url, {
        contents: [{ parts: [{ text: prompt }] }],
      });
      return res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || `Crypto market short: ${context}`;
    } catch {
      return `Crypto market short: ${context}`;
    }
  }
}
