export const DAY = 86400000;
export const CARE_TYPES = ['water', 'fertilize', 'repot', 'prune', 'inspect', 'harvest'];
export const PHASES = ['seed', 'growing', 'flowering', 'fruiting', 'dormant'];
export function fail(en, fr) {
  throw new Error(`${fr} / ${en}`);
}
export function text(value, name, max = 60, required = true) {
  if (
    typeof value !== 'string' ||
    value.trim().length > max ||
    (required && !value.trim()) ||
    [...value].some((char) => char.codePointAt(0) < 32)
  )
    fail(
      `Invalid ${name} (max ${max} characters).`,
      `${name} invalide (${max} caractères maximum).`,
    );
  return value.trim();
}
export function number(value, name, min, max, integer = false) {
  if (
    value === '' ||
    value === null ||
    typeof value === 'boolean' ||
    !['number', 'string'].includes(typeof value)
  )
    fail(`Invalid ${name}.`, `${name} invalide.`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n)))
    fail(`Invalid ${name}.`, `${name} invalide.`);
  return n;
}
export function choice(value, values, name) {
  if (!values.includes(value)) fail(`Invalid ${name}.`, `${name} invalide.`);
  return value;
}
export function date(value, name = 'date') {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    fail(
      `Invalid ${name}: use ISO 8601 with timezone.`,
      `${name} invalide : utilisez ISO 8601 avec fuseau horaire.`,
    );
  return new Date(value).toISOString();
}
export function bool(value, name) {
  if (typeof value !== 'boolean') fail(`Invalid ${name}.`, `${name} invalide.`);
  return value;
}
export const present = (v) => v !== undefined && v !== null && v !== '';
