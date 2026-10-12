import { present } from './validation.js';
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const timestamp = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
export const weatherKey = (house, provider = '') => JSON.stringify([house, provider]);
export function normalizeWeather(raw, now = Date.now()) {
  const units = raw?.units ?? raw?.options?.units;
  if (!['metric', 'us'].includes(units) || !timestamp(raw?.datetime))
    throw new Error('Invalid weather units or timestamp');
  const temperature = (v) => (finite(v) ? (units === 'us' ? ((v - 32) * 5) / 9 : v) : null);
  const wind = (v) => (finite(v) && v >= 0 ? (units === 'us' ? v * 1.609344 : v * 3.6) : null);
  const current = {
    at: new Date(raw.datetime).toISOString(),
    temperature: temperature(raw.temperature),
    wind: wind(raw.wind_speed),
  };
  const hours = (Array.isArray(raw.hours) ? raw.hours : [])
    .slice(0, 48)
    .filter((h) => timestamp(h?.datetime))
    .map((h) => ({
      at: new Date(h.datetime).toISOString(),
      temperature: temperature(h.temperature),
      wind: wind(h.wind_speed),
    }));
  const days = (Array.isArray(raw.days) ? raw.days : [])
    .slice(0, 8)
    .filter((d) => timestamp(d?.datetime))
    .map((d) => ({
      at: new Date(d.datetime).toISOString(),
      min: temperature(d.temperature_min),
      max: temperature(d.temperature_max),
      wind: wind(d.wind_speed),
    }));
  return { receivedAt: new Date(now).toISOString(), current, hours, days };
}
export async function fetchWeather({
  host,
  apiKey,
  house,
  provider = '',
  fetcher = fetch,
  now = Date.now(),
}) {
  if (!apiKey || !house)
    throw new Error(
      'Configurez la maison et la clé API Gladys / Configure house and Gladys API key',
    );
  const base = new URL(host);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
    throw new Error('Invalid Gladys host');
  const url = new URL(`/api/v1/house/${encodeURIComponent(house)}/weather`, base);
  if (provider) url.searchParams.set('service', provider);
  // The user API key is deliberately distinct from the integration JWT. Never
  // follow redirects: credentials must only reach the supervisor's Gladys host.
  const response = await fetcher(url, {
    headers: { authorization: apiKey, accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      `Météo Gladys indisponible / Gladys weather unavailable (HTTP ${response.status})`,
    );
  if (Number(response.headers?.get('content-length')) > 1024 * 1024)
    throw new Error('Weather response too large');
  let body = '';
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    body += decoder.decode(chunk, { stream: true });
    if (Buffer.byteLength(body) > 1024 * 1024) throw new Error('Weather response too large');
  }
  body += decoder.decode();
  return normalizeWeather(JSON.parse(body), now);
}
export function weatherFor(plant, state, config, now) {
  if (!config.weather_enabled) return { status: 'disabled' };
  const house = plant.house || config.house;
  if (!house || !config.weather_api_key) return { status: 'unconfigured' };
  const entry = state.weather[weatherKey(house, config.provider)];
  if (!entry?.data) return { status: entry?.error ? 'unavailable' : 'pending' };
  const w = entry.data,
    maxAge = config.weather_max_age * 60000;
  if (
    now - Date.parse(w.receivedAt) > maxAge ||
    now - Date.parse(w.current.at) > maxAge ||
    Date.parse(w.current.at) > now + 300000
  )
    return { status: 'stale' };
  const end = now + config.forecast_hours * 3600000;
  const hours = w.hours.filter((h) => Date.parse(h.at) >= now && Date.parse(h.at) <= end);
  const localDay = (at) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: config.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(at));
  const today = localDay(now),
    lastDay = localDay(end);
  const days = w.days.filter((d) => localDay(d.at) >= today && localDay(d.at) <= lastDay);
  const values = [w.current.temperature, ...hours.map((h) => h.temperature)].filter(finite);
  const lows = [...values, ...days.map((d) => d.min).filter(finite)],
    highs = [...values, ...days.map((d) => d.max).filter(finite)];
  const winds = [w.current.wind, ...hours.map((h) => h.wind), ...days.map((d) => d.wind)].filter(
    finite,
  );
  return {
    status: entry.error ? 'cached' : 'fresh',
    min: lows.length ? Math.min(...lows) : null,
    max: highs.length ? Math.max(...highs) : null,
    wind: winds.length ? Math.max(...winds) : null,
    forecast:
      hours.some((h) => finite(h.temperature)) || days.some((d) => finite(d.min) || finite(d.max)),
    receivedAt: w.receivedAt,
  };
}
export function risksFor(plant, state, config, now) {
  if (plant.archived || plant.environment !== 'outside') return [];
  const weather = weatherFor(plant, state, config, now);
  if (!['fresh', 'cached'].includes(weather.status)) return [];
  return [
    ['cold', 'min', (v, t) => v <= t],
    ['heat', 'max', (v, t) => v >= t],
    ['wind', 'wind', (v, t) => v >= t],
  ]
    .filter(
      ([kind, key, compare]) =>
        present(plant.thresholds[kind]) &&
        finite(weather[key]) &&
        compare(weather[key], plant.thresholds[kind]),
    )
    .map(([kind, key]) => ({
      plant,
      kind,
      value: Math.round(weather[key] * 10) / 10,
      threshold: plant.thresholds[kind],
      advice: kind === 'cold' && plant.growing === 'pot' ? 'bring_inside' : 'protect',
      forecast: weather.forecast,
    }));
}
export class WeatherService {
  constructor(store, { host, fetcher = fetch, clock = () => Date.now() }) {
    this.store = store;
    this.host = host;
    this.fetcher = fetcher;
    this.clock = clock;
    this.busy = null;
  }
  async refresh(config) {
    if (this.busy) return this.busy;
    if (!config.weather_enabled) return { ok: 0, failed: 0 };
    const run = async () => {
      const plants = this.store
        .snapshot()
        .plants.filter((p) => !p.archived && p.environment === 'outside');
      const houses = [
        ...new Set([config.house, ...plants.map((p) => p.house || config.house)].filter(Boolean)),
      ];
      if (!config.weather_api_key || !houses.length)
        throw new Error(
          'Configurez la météo : maison et clé API Gladys / Configure weather house and API key',
        );
      let ok = 0,
        failed = 0;
      for (let start = 0; start < houses.length; start += 3)
        await Promise.all(
          houses.slice(start, start + 3).map(async (house) => {
            const key = weatherKey(house, config.provider);
            try {
              const data = await fetchWeather({
                host: this.host,
                apiKey: config.weather_api_key,
                house,
                provider: config.provider,
                fetcher: this.fetcher,
                now: this.clock(),
              });
              await this.store.transaction((s) => {
                s.weather[key] = { data, error: false };
              });
              ok++;
            } catch {
              await this.store.transaction((s) => {
                s.weather[key] = { ...s.weather[key], error: true };
              });
              failed++;
            }
          }),
        );
      return { ok, failed };
    };
    this.busy = run().finally(() => {
      this.busy = null;
    });
    return this.busy;
  }
}
