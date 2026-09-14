const MESSAGES_KEY = 'kimi_k3_messages';
const SYSTEM_PROMPT_KEY = 'kimi_k3_system_prompt';
const SETTINGS_KEY = 'kimi_k3_settings';

export const DEFAULT_SETTINGS = {
  reasoning_effort: 'high',
  max_tokens: 16384,
  temperature: 1.0,
};

export const DEFAULT_SYSTEM_PROMPT = '';

export function loadStoredMessages() {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to load messages from localStorage', e);
    return [];
  }
}

export function saveStoredMessages(messages) {
  try {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  } catch (e) {
    console.error('Failed to save messages to localStorage', e);
  }
}

export function loadStoredSystemPrompt() {
  try {
    const raw = localStorage.getItem(SYSTEM_PROMPT_KEY);
    return raw !== null ? raw : DEFAULT_SYSTEM_PROMPT;
  } catch (e) {
    return DEFAULT_SYSTEM_PROMPT;
  }
}

export function saveStoredSystemPrompt(prompt) {
  try {
    localStorage.setItem(SYSTEM_PROMPT_KEY, prompt);
  } catch (e) {
    console.error('Failed to save system prompt', e);
  }
}

export function loadStoredSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      reasoning_effort: ['low', 'high', 'max'].includes(parsed.reasoning_effort)
        ? parsed.reasoning_effort
        : DEFAULT_SETTINGS.reasoning_effort,
      max_tokens: Number(parsed.max_tokens) || DEFAULT_SETTINGS.max_tokens,
      temperature: typeof parsed.temperature === 'number' ? parsed.temperature : DEFAULT_SETTINGS.temperature,
    };
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}

export function clearStoredMessages() {
  try {
    localStorage.removeItem(MESSAGES_KEY);
  } catch (e) {}
}
