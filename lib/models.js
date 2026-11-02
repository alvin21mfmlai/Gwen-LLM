// Model catalogue shown in the model picker.
// Safe to import from both server and browser code (no secrets here).
//
// To change the list without editing code, set the MODELS_JSON environment
// variable in Vercel to a JSON array with the same shape as DEFAULT_MODELS.
// Only models whose provider has an API key configured are shown.

export const DEFAULT_MODELS = [
  {
    id: 'claude-sonnet-5-5',
    provider: 'anthropic',
    label: 'Claude Sonnet 5.5',
    description: 'Smart and quick. A great everyday choice.',
  },
  {
    id: 'claude-opus-5-5',
    provider: 'anthropic',
    label: 'Claude Opus 5.5',
    description: 'For harder thinking, long documents and careful writing.',
  },
  {
    id: 'claude-haiku-5-5',
    provider: 'anthropic',
    label: 'Claude Haiku 5.5',
    description: 'Fastest and cheapest Claude for simple questions.',
  },
  {
    id: 'claude-fable-5-1',
    provider: 'anthropic',
    label: 'Claude Fable 5.1',
    description: "Anthropic's most capable model. Costs the most.",
  },
  {
    id: 'gpt-6.1-sol',
    provider: 'openai',
    label: 'GPT-6.1 Sol',
    description: "OpenAI's balanced model for everyday use.",
  },
  {
    id: 'gpt-6-astra',
    provider: 'openai',
    label: 'GPT-6 Astra',
    description: "OpenAI's most capable model. Costs the most.",
  },
  {
    id: 'gpt-6-luna',
    provider: 'openai',
    label: 'GPT-6 Luna',
    description: 'Fast and low-cost OpenAI model.',
    reasoning: 'low',
  },
];

export const PROVIDER_NAMES = { anthropic: 'Anthropic', openai: 'OpenAI' };

export const IMAGE_SIZES = [
  { id: 'auto', label: 'Auto' },
  { id: '1024x1024', label: 'Square' },
  { id: '1536x1024', label: 'Landscape' },
  { id: '1024x1536', label: 'Portrait' },
];

export const IMAGE_QUALITIES = [
  { id: 'auto', label: 'Auto' },
  { id: 'low', label: 'Draft' },
  { id: 'medium', label: 'Standard' },
  { id: 'high', label: 'Best' },
];
