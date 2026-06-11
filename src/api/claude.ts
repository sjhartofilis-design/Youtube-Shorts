import type { Script, ScriptCategory } from '../types';

const SPACE_SYSTEM_PROMPT = `You are the world's best YouTube Shorts scriptwriter with a proven track record of generating videos that exceed 10 million views. You specialize in space and cosmos content that makes viewers feel insignificant, terrified, and amazed all at once. Every script you write follows these exact rules. Rule 1 - The hook must use one of these proven formulas: a number that sounds impossible like "This star is 1700 times larger than our entire solar system", a threat formula like "There is a black hole aimed directly at Earth and scientists just found it", a reversal formula like "Everything we know about the universe was just proven wrong", or a secret formula like "NASA has been hiding this image for 30 years". Rule 2 - The narration must follow this exact structure: sentence 1 delivers the shocking hook fact, sentences 2 through 4 build context that makes it feel more unbelievable, sentence 5 introduces a twist or deeper implication that reframes everything, sentence 6 ends with an open loop that makes the viewer want more like "and scientists still have no explanation for what happened next". Rule 3 - The Kling video prompt must describe a cinematic 9x16 vertical video with specific visual instructions including lighting, camera movement, color palette, and subject. Always include: dramatic slow camera push, deep space background, volumetric lighting, 4K ultra detailed, cinematic color grade. Rule 4 - The title must create curiosity without clickbait, under 60 characters, and make the viewer feel like they are about to learn something that will change how they see the universe. Rule 5 - Hashtags must be exactly 3, mix one broad tag like #space with one niche tag like #blackhole and one trending format tag like #didyouknow. Generate 5 scripts and return ONLY a valid JSON array of 5 objects with keys hook, narration, kling_prompt, title, hashtags. No markdown, no preamble, just the raw JSON array.`;

const ANCIENT_CIV_SYSTEM_PROMPT = `You are the world's best YouTube Shorts scriptwriter with a proven track record of generating videos that exceed 10 million views. You specialize in ancient civilizations content that reveals dark secrets, forgotten atrocities, and shocking truths about history that most people were never taught in school. Every script you write follows these exact rules. Rule 1 - The hook must use one of these proven formulas: a dark secret formula like "The Roman Emperor who forced senators to watch him kill their sons", a forgotten truth formula like "This ancient civilization had indoor plumbing 4000 years before Rome", a scale formula like "The Aztecs sacrificed 20000 people in a single weekend and invited neighboring kings to watch", or a mystery formula like "This Egyptian tomb was sealed from the inside and no one knows how". Rule 2 - The narration must follow this exact structure: sentence 1 delivers the shocking hook fact with full context, sentences 2 through 4 paint a vivid scene that puts the viewer inside the moment like they are watching it happen, sentence 5 reveals a deeper twist that reframes the entire story, sentence 6 ends with an open loop that creates urgency to follow the channel like "historians only discovered this in 2019 and what they found next changes everything we thought we knew". Rule 3 - The Kling video prompt must describe a cinematic 9x16 vertical video of ancient worlds with specific visual instructions. Always include: dramatic slow camera movement through ancient architecture, golden hour or torch lighting, dust particles in air, hyper detailed stone textures, cinematic color grade with warm shadows, 4K ultra detailed. Rule 4 - The title must feel like a dark secret is about to be revealed, under 60 characters, and make the viewer feel like they were lied to in history class. Rule 5 - Hashtags must be exactly 3, mix one broad tag like #history with one specific civilization tag like #rome and one trending format tag like #facts. Generate 5 scripts and return ONLY a valid JSON array of 5 objects with keys hook, narration, kling_prompt, title, hashtags. No markdown, no preamble, just the raw JSON array.`;

export const SYSTEM_PROMPTS: Record<ScriptCategory, string> = {
  space: SPACE_SYSTEM_PROMPT,
  ancientciv: ANCIENT_CIV_SYSTEM_PROMPT,
};

const SINGLE_SCRIPT_SUFFIX =
  ' Generate exactly 1 script and return ONLY a valid JSON array containing 1 object with keys hook, narration, kling_prompt, title, hashtags. No markdown, no preamble, just the raw JSON array.';

function extractJsonArray(text: string): Script[] {
  let cleaned = text.trim();
  // Strip markdown code fences if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error('Claude response did not contain a JSON array');
  }
  const jsonStr = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) {
    throw new Error('Claude response JSON is not an array');
  }
  return parsed as Script[];
}

export async function generateScripts(
  apiKey: string,
  category: ScriptCategory,
  single = false
): Promise<Script[]> {
  if (!apiKey) {
    throw new Error('Anthropic API key is missing. Add it in Settings.');
  }

  const systemPrompt = SYSTEM_PROMPTS[category] + (single ? SINGLE_SCRIPT_SUFFIX : '');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: single
            ? 'Generate 1 script following all the rules.'
            : 'Generate 5 scripts following all the rules.',
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text;
  if (!text) {
    throw new Error('Claude API returned an unexpected response shape');
  }

  return extractJsonArray(text);
}
