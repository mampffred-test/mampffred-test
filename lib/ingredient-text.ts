import { matchCatalogFoods } from './food-catalog.ts';
import {
  formatQuantity,
  parseQuantity,
  parseQuantityRange,
} from './quantity.ts';
import { canonicalUnit, unitLabel } from './units.ts';

export type ParsedIngredient = {
  amount: string;
  unit: string;
  name: string;
  note?: string;
  optional: boolean;
};

const OPTIONAL_PATTERN = /\boptional\b:?|\bnach belieben\b/i;
const LEADING_SOFT_AMOUNT = /^(etwas|einige|wenig|ein paar|evtl\.?)\s+/i;
const TRAILING_PURPOSE = /\s+((?:zum|zur|für|nach)\s+.+)$/i;

function joinNotes(notes: string[]) {
  const unique = [...new Set(notes.map((note) => note.trim()).filter(Boolean))];
  return unique.length ? unique.join(', ') : undefined;
}

/**
 * Separates a written ingredient name into what to buy ("Walnüsse"), a
 * note ("die Kerne verwenden") and whether it is optional. The original
 * wording stays readable; nothing is guessed beyond punctuation.
 */
export function splitIngredientName(value: string): {
  name: string;
  note?: string;
  optional: boolean;
} {
  let text = value.trim().replace(/\s+/g, ' ');
  const notes: string[] = [];
  const optional = OPTIONAL_PATTERN.test(text);
  // "Halloumi optional: als Ersatz …": the words after "optional" are a note.
  const inlineOptional = text.match(/^(.+?)\s+optional:?\s+(.+)$/i);
  if (inlineOptional) {
    notes.push(inlineOptional[2]);
    text = inlineOptional[1];
  }
  text = text
    .replace(/^optional:?\s*/i, '')
    .replace(/,?\s*nach belieben\b/i, '')
    .replace(/\s+optional:?\s*/i, ' ')
    .trim();
  const soft = text.match(LEADING_SOFT_AMOUNT);
  if (soft) {
    notes.push(soft[1].toLocaleLowerCase('de-DE'));
    text = text.slice(soft[0].length);
  }
  const parenthesised: string[] = [];
  text = text
    .replace(/\(([^)]*)\)/g, (_, inner: string) => {
      parenthesised.push(inner);
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
  // "Salz, Pfeffer und Gewürze" is a list of foods, not a name with a note.
  const isFoodList = matchCatalogFoods(text).length > 1;
  const commaIndex = isFoodList ? -1 : text.search(/[,;]/);
  let afterComma = '';
  if (commaIndex > 0) {
    afterComma = text.slice(commaIndex + 1);
    text = text.slice(0, commaIndex).trim();
  }
  const purpose = text.match(TRAILING_PURPOSE);
  if (
    purpose &&
    !isFoodList &&
    !/^nach (?:geschmack|wahl|bedarf)$/i.test(purpose[1])
  ) {
    notes.push(purpose[1]);
    text = text.slice(0, purpose.index).trim();
  }
  notes.push(afterComma, ...parenthesised);
  const name = text.replace(/[,;:\s]+$/, '').trim() || value.trim();
  const note = joinNotes(notes);
  return { name, ...(note ? { note } : {}), optional };
}

const BULLET = /^\s*(?:[-–•*·▪◦]+|\d+[.)])\s+/;
const AMOUNT_PATTERN =
  /^((?:\d+\s+)?\d+\/\d+|\d*\s?[½⅓⅔¼¾⅕⅛]|\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?)/;

function normalizedAmount(raw: string) {
  const range = parseQuantityRange(raw);
  if (!range) return '';
  const format = (value: number) => formatQuantity(value, { fractions: false });
  return range.min === range.max
    ? format(range.min)
    : `${format(range.min)}–${format(range.max)}`;
}

/** Parses one written ingredient line, e.g. from a pasted recipe. */
export function parseIngredientLine(line: string): ParsedIngredient {
  let text = line.replace(BULLET, '').trim().replace(/\s+/g, ' ');
  let amount = '';
  let unit = '';
  // "ca. 125 ml" and "etwa 2" are amounts; "2x Zwiebeln" means two onions.
  text = text.replace(/^(?:ca\.?|circa|etwa|ungefähr)\s+(?=[\d½⅓⅔¼¾⅕⅛])/i, '');
  const amountMatch = text.match(AMOUNT_PATTERN);
  if (amountMatch && parseQuantityRange(amountMatch[1].trim())) {
    amount = normalizedAmount(amountMatch[1].trim());
    text = text
      .slice(amountMatch[0].length)
      .replace(/^\s*[x×](?=\s|$)/i, '')
      .trim();
    const unitMatch = text.match(/^([A-Za-zÄÖÜäöüß.]+)(?:\s+|$)/);
    const unitKey = unitMatch ? canonicalUnit(unitMatch[1]) : undefined;
    if (unitMatch && unitKey) {
      // Recipe units are stored in their singular form, like the unit picker.
      unit = unitLabel(unitKey, 1);
      text = text.slice(unitMatch[0].length).trim();
    } else unit = 'Stück';
  } else {
    const trailing = text.match(
      /^(.*?)[,:]?\s+(\d+(?:[.,]\d+)?)\s*([A-Za-zÄÖÜäöüß.]+)$/,
    );
    const trailingUnit = trailing ? canonicalUnit(trailing[3]) : undefined;
    if (trailing && trailingUnit && parseQuantity(trailing[2])) {
      amount = normalizedAmount(trailing[2]);
      unit = unitLabel(trailingUnit, 1);
      text = trailing[1].trim();
    }
  }
  let leadingNote: string | undefined;
  const packNote = text.match(/^\(([^)]*)\)\s*/);
  if (packNote) {
    leadingNote = packNote[1].trim();
    text = text.slice(packNote[0].length);
  }
  const split = splitIngredientName(text);
  const note = joinNotes([leadingNote ?? '', split.note ?? '']);
  return {
    amount,
    unit,
    name: split.name,
    ...(note ? { note } : {}),
    optional: split.optional,
  };
}
