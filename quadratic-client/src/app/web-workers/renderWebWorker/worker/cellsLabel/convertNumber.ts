import { JsNumber } from '@/app/quadratic-core-types';
import { BigNumber } from 'bignumber.js';

// Converts a number to a string with the given cell formatting
export const convertNumber = (n: string, format: JsNumber, currentFractionDigits?: number): string => {
  let number = new BigNumber(n);
  let suffix = '';
  if (format.format?.type === 'PERCENTAGE') {
    number = number.times(100);
    suffix = '%';
  }

  let options: BigNumber.Format = { decimalSeparator: '.', groupSeparator: ',' };
  const isCurrency = format.format?.type === 'CURRENCY';
  const isScientific = format.format?.type === 'EXPONENTIAL';
  const isPercent = format.format?.type === 'PERCENTAGE';

  // set commas
  if (!isScientific && !isPercent && (format.commas || (format.commas === null && isCurrency))) {
    options.groupSize = 3;
  }

  if (currentFractionDigits === undefined) {
    if (format.decimals !== null) {
      currentFractionDigits = format.decimals;
    } else if (isCurrency || isScientific) {
      currentFractionDigits = 2;
    }
  }

  if (format.format?.type === 'CURRENCY') {
    if (format.format.symbol) {
      options.prefix = format.format.symbol;
    } else {
      throw new Error('Expected format.symbol to be defined in convertNumber.ts');
    }
  }

  if (isScientific) {
    if (currentFractionDigits !== undefined) {
      return number.toExponential(currentFractionDigits);
    } else {
      return number.toExponential(2);
    }
  }

  if (currentFractionDigits !== undefined) {
    return number.toFormat(currentFractionDigits, options) + suffix;
  }
  return number.toFormat(options) + suffix;
};

// Reduces the number of decimals (used by rendering to show a fractional number in a smaller-width cell)
export const reduceDecimals = (
  number: string,
  current: string,
  format: JsNumber,
  currentFractionDigits?: number
): { number: string; currentFractionDigits: number } | undefined => {
  if (currentFractionDigits === undefined) {
    currentFractionDigits = getFractionDigits(number, current, format);
    currentFractionDigits = Math.max(0, currentFractionDigits - 1);
  }
  const updated = convertNumber(number, format, currentFractionDigits);
  if (updated !== current) {
    return { number: updated, currentFractionDigits };
  }
};

export const getFractionDigits = (number: string, current: string, format: JsNumber): number => {
  // this only works if there is a fractional part
  if (format.format?.type === 'EXPONENTIAL') {
    return number.length - (number[0] === '-' ? 2 : 1);
  } else if (current.includes('.')) {
    return current.split('.')[1].length;
  }
  return 0;
};
