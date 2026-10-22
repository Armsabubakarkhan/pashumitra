// Optional live weather via Open-Meteo (no API key needed). The browser never calls it directly.
import { HttpError } from './util.js';

const cache = new Map();
const TTL = 10 * 60 * 1000;

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('bad status ' + res.status);
  return res.json();
}

export async function weatherFor(city) {
  const key = city.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.t > Date.now()) return hit.v;
  try {
    const geo = await getJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(city));
    const place = geo && geo.results && geo.results[0];
    if (!place) throw new HttpError(404, 'Could not find that place. Check the spelling or enter the values by hand');
    const lat = Number(place.latitude), lon = Number(place.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('bad coordinates');
    const wx = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m`);
    const cur = wx && wx.current;
    const t = Number(cur && cur.temperature_2m), h = Number(cur && cur.relative_humidity_2m);
    if (!Number.isFinite(t) || !Number.isFinite(h)) throw new Error('bad weather payload');
    const value = { place: String(place.name || city).slice(0, 80), region: String(place.admin1 || '').slice(0, 80), temperature_c: Math.round(t * 10) / 10, humidity: Math.round(h) };
    if (cache.size > 200) cache.clear();
    cache.set(key, { t: Date.now() + TTL, v: value });
    return value;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, 'The weather service could not be reached. Enter temperature and humidity by hand');
  }
}
