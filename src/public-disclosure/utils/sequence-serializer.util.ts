export type SequenceType =
  | 'NUMERIC'
  | 'UPPER_ALPHA'
  | 'LOWER_ALPHA'
  | 'UPPER_ROMAN'
  | 'LOWER_ROMAN';

const ROMAN_UPPER_SET = new Set([
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
]);

const ROMAN_LOWER_SET = new Set([
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
  'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx',
]);

/**
 * Convert 1-based integer to Roman numerals.
 */
export function toRoman(num: number): string {
  const romanMap: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];

  let n = Math.max(1, Math.floor(num));
  let result = '';
  for (const [val, roman] of romanMap) {
    while (n >= val) {
      result += roman;
      n -= val;
    }
  }
  return result || 'I';
}

/**
 * Convert 0-based index to alphabetic letters (0 -> A, 1 -> B, 25 -> Z, 26 -> AA).
 */
export function toAlpha(index: number, uppercase = true): string {
  let s = '';
  let n = Math.max(0, index);
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + (uppercase ? 65 : 97)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/**
 * Smartly identify which sequence pattern (1,2,3... / A,B,C... / I,II,III...) the section is using.
 */
export function detectSequenceType(items?: { srNo?: any }[]): SequenceType {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return 'NUMERIC';
  }

  const rawValues = items
    .map((item) => (item?.srNo !== undefined && item?.srNo !== null ? String(item.srNo).trim() : ''))
    .filter(Boolean);

  if (rawValues.length === 0) {
    return 'NUMERIC';
  }

  // 1. Check for distinct Roman numerals (like II, III, IV, VI, VII, VIII, IX, XI)
  const hasDistinctUpperRoman = rawValues.some((v) =>
    ['II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'XIII', 'XIV', 'XV'].includes(v.toUpperCase()),
  );
  if (hasDistinctUpperRoman) return 'UPPER_ROMAN';

  const hasDistinctLowerRoman = rawValues.some((v) =>
    ['ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii', 'xiii', 'xiv', 'xv'].includes(v.toLowerCase()),
  );
  if (hasDistinctLowerRoman) return 'LOWER_ROMAN';

  // 2. Check the first item
  const first = rawValues[0];

  // If first item is 'I' or 'i'
  if (first === 'I') {
    if (rawValues[1] && (ROMAN_UPPER_SET.has(rawValues[1]) || rawValues[1] === 'II')) {
      return 'UPPER_ROMAN';
    }
    return 'UPPER_ROMAN';
  }
  if (first === 'i') {
    return 'LOWER_ROMAN';
  }

  // 3. Single uppercase/lowercase letters A-Z (excluding 'I' handled above)
  if (/^[A-Z]$/.test(first)) {
    return 'UPPER_ALPHA';
  }
  if (/^[a-z]$/.test(first)) {
    return 'LOWER_ALPHA';
  }

  // 4. Check if any items use alphabetical letters
  if (rawValues.some((v) => /^[A-HJ-UW-Z]$/.test(v))) {
    return 'UPPER_ALPHA';
  }
  if (rawValues.some((v) => /^[a-hj-uw-z]$/.test(v))) {
    return 'LOWER_ALPHA';
  }

  // 5. Default to standard numeric 1, 2, 3...
  return 'NUMERIC';
}

/**
 * Serialize an array of section items to guarantee no duplicates,
 * assigning clean sequential numbers formatted according to the detected or specified sequence pattern.
 */
export function serializeItemsSrNo<T extends { srNo?: any }>(
  items?: T[],
  forcedType?: SequenceType,
): T[] {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [];
  }

  const seqType = forcedType || detectSequenceType(items);

  return items.map((item, idx) => {
    let serializedSrNo: number | string;

    switch (seqType) {
      case 'UPPER_ALPHA':
        serializedSrNo = toAlpha(idx, true);
        break;
      case 'LOWER_ALPHA':
        serializedSrNo = toAlpha(idx, false);
        break;
      case 'UPPER_ROMAN':
        serializedSrNo = toRoman(idx + 1);
        break;
      case 'LOWER_ROMAN':
        serializedSrNo = toRoman(idx + 1).toLowerCase();
        break;
      case 'NUMERIC':
      default:
        serializedSrNo = idx + 1;
        break;
    }

    return {
      ...item,
      srNo: serializedSrNo,
    };
  });
}

/**
 * Predict next serial value when appending an item to an existing list.
 */
export function getNextSerial(items?: { srNo?: any }[]): number | string {
  if (!items || items.length === 0) return 1;
  const seqType = detectSequenceType(items);
  const nextIdx = items.length;

  switch (seqType) {
    case 'UPPER_ALPHA':
      return toAlpha(nextIdx, true);
    case 'LOWER_ALPHA':
      return toAlpha(nextIdx, false);
    case 'UPPER_ROMAN':
      return toRoman(nextIdx + 1);
    case 'LOWER_ROMAN':
      return toRoman(nextIdx + 1).toLowerCase();
    case 'NUMERIC':
    default:
      return nextIdx + 1;
  }
}
