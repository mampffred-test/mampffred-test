import {
  parseIngredientLine,
  type ParsedIngredient,
} from './ingredient-text.ts';

export type ParsedRecipeText = {
  name: string;
  description: string;
  servings?: number;
  minutes?: number;
  ingredients: Array<ParsedIngredient & { scaleWithServings?: false }>;
  steps: string[];
};

const MAX_TEXT_LENGTH = 50_000;
const INGREDIENT_HEADER =
  /^(?:zutaten(?:liste)?|einkaufsliste|du brauchst|ihr braucht|für den teig|für die soße|für die sauce)\b[^:]*:?$/i;
const STEP_HEADER =
  /^(?:zubereitung|anleitung|so geht'?s|so wird'?s gemacht|schritte|arbeitsschritte|und so geht'?s)\b[^:]*:?$/i;
const META_LINE =
  /^(?:(?:ca\.?\s*)?\d+\s*(?:min\.?|minuten|std\.?|stunden?)\b|(?:für\s+)?(?:ca\.?\s*)?\d+\s*(?:portionen|personen|pers\.?)\b|(?:zubereitungszeit|kochzeit|backzeit|arbeitszeit|gesamtzeit|dauer|portionen|personen)\s*:)/i;
/** "Für den Belag:" groups ingredients but is not one. */
const SUB_HEADER = /^[^\d½⅓⅔¼¾].{0,40}:$/;
const FIXED_NOTE = /\s*\(Menge bleibt bei Portionsänderung gleich\)\s*$/;
const BULLET = /^\s*(?:[-–•*·▪◦]+|\d+[.)])\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}]/gu;

function servingsIn(text: string) {
  const match = text.match(
    /(\d+)\s*(?:portionen|portion|personen|person|pers\.?)/i,
  );
  const value = match ? Number(match[1]) : undefined;
  return value && value > 0 && value <= 1_000 ? value : undefined;
}

function minutesIn(text: string) {
  const hours = text.match(/(\d+(?:[.,]\d+)?)\s*(?:std\.?|stunden?|h)\b/i);
  const minutes = text.match(/(\d+)\s*(?:min\.?|minuten)\b/i);
  const total =
    (hours ? Number(hours[1].replace(',', '.')) * 60 : 0) +
    (minutes ? Number(minutes[1]) : 0);
  return total > 0 && total <= 10_080 ? Math.round(total) : undefined;
}

function looksLikeIngredient(line: string) {
  const text = line.replace(BULLET, '').trim();
  if (!text || text.length > 120) return false;
  if (/[.!?]$/.test(text) && text.split(' ').length > 5) return false;
  const parsed = parseIngredientLine(text);
  return Boolean(parsed.amount) || /^[-–•*·▪◦]/.test(line.trim());
}

function toIngredient(line: string) {
  const fixed = FIXED_NOTE.test(line);
  const parsed = parseIngredientLine(line.replace(FIXED_NOTE, ''));
  return fixed ? { ...parsed, scaleWithServings: false as const } : parsed;
}

/**
 * Turns pasted recipe text (messenger, website, Mampffred's own share text)
 * into a draft. It never invents content; unclear lines become steps.
 */
export function parseRecipeText(input: string): ParsedRecipeText {
  const lines = input
    .slice(0, MAX_TEXT_LENGTH)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(EMOJI, '').replace(/\s+/g, ' ').trim());
  const result: ParsedRecipeText = {
    name: '',
    description: '',
    ingredients: [],
    steps: [],
  };
  const descriptionLines: string[] = [];
  let section: 'head' | 'ingredients' | 'steps' | 'auto' = 'head';
  let sawHeader = false;
  let titleDone = false;
  let stepBuffer = '';
  const flushStep = () => {
    const step = stepBuffer.replace(NUMBERED, '').trim();
    if (step) result.steps.push(step);
    stepBuffer = '';
  };

  for (const line of lines) {
    if (!line) {
      if (section === 'steps') flushStep();
      continue;
    }
    if (INGREDIENT_HEADER.test(line)) {
      // "Zutaten (für 4 Personen):"
      result.servings ??= servingsIn(line);
      section = 'ingredients';
      sawHeader = true;
      continue;
    }
    if (STEP_HEADER.test(line)) {
      flushStep();
      section = 'steps';
      sawHeader = true;
      continue;
    }
    if (!titleDone) {
      titleDone = true;
      // Without a title line the first line is already an ingredient.
      if (!(looksLikeIngredient(line) && parseIngredientLine(line).amount)) {
        result.name = line.slice(0, 200);
        continue;
      }
    }
    if (section === 'head' || section === 'auto') {
      if (META_LINE.test(line) || (servingsIn(line) && line.length < 60)) {
        result.servings ??= servingsIn(line);
        result.minutes ??= minutesIn(line);
        continue;
      }
      if (!sawHeader && looksLikeIngredient(line)) {
        section = 'auto';
        result.ingredients.push(toIngredient(line));
        continue;
      }
      if (section === 'auto' || result.ingredients.length) {
        result.steps.push(line.replace(NUMBERED, ''));
        continue;
      }
      descriptionLines.push(line);
      continue;
    }
    if (section === 'ingredients') {
      if (META_LINE.test(line) || SUB_HEADER.test(line)) continue;
      result.ingredients.push(toIngredient(line));
      continue;
    }
    // Steps: numbered lines start a new step, others continue it.
    if (NUMBERED.test(line) || !stepBuffer) {
      flushStep();
      stepBuffer = line;
    } else stepBuffer = `${stepBuffer} ${line}`;
  }
  flushStep();

  result.description = descriptionLines.join(' ').slice(0, 5_000);
  result.ingredients = result.ingredients
    .filter((ingredient) => ingredient.name)
    .slice(0, 500);
  result.steps = result.steps.filter(Boolean).slice(0, 500);
  return result;
}
