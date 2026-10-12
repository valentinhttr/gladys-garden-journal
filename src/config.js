import { number, text, bool } from './validation.js';
export const DEFAULT_CONFIG = {
  weather_enabled: false,
  house: '',
  provider: '',
  weather_interval: 30,
  forecast_hours: 24,
  weather_max_age: 120,
  timezone: 'Europe/Zurich',
  digest_hour: 8,
  digest_enabled: true,
};
export function normalizeConfig(raw = {}) {
  const c = { ...DEFAULT_CONFIG, ...raw };
  c.weather_enabled = bool(c.weather_enabled, 'weather_enabled');
  c.digest_enabled = bool(c.digest_enabled, 'digest_enabled');
  for (const [key, min, max] of [
    ['weather_interval', 15, 360],
    ['forecast_hours', 1, 48],
    ['weather_max_age', 30, 360],
    ['digest_hour', 0, 23],
  ])
    c[key] = number(c[key], key, min, max, true);
  c.house = text(c.house, 'house', 100, false);
  c.provider = text(c.provider, 'provider', 100, false);
  c.timezone = text(c.timezone, 'timezone', 80);
  try {
    new Intl.DateTimeFormat('en', { timeZone: c.timezone }).format();
  } catch {
    throw new Error('Fuseau horaire invalide / Invalid timezone');
  }
  c.weather_api_key = text(c.weather_api_key ?? '', 'API key', 1000, false);
  return c;
}
