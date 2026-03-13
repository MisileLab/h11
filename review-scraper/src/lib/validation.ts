export const MAX_REVIEW_COUNT = 10000;

const INVALID_COUNT_MESSAGE = `Review count must be a whole number between 0 and ${MAX_REVIEW_COUNT}.`;
const NEGATIVE_COUNT_MESSAGE = "Review count cannot be negative. Leave it blank or use 0 to fetch all reviews.";
const RANGE_COUNT_MESSAGE = `Review count must be between 0 and ${MAX_REVIEW_COUNT}.`;

type CountValidationResult =
  | { count: number; error?: never }
  | { count?: never; error: string };

export function normalizeAppId(value: string): string {
  return value.trim();
}

export function validateCountValue(value: unknown): CountValidationResult {
  if (value === undefined) {
    return { count: 0 };
  }

  if (typeof value !== "number" || Number.isNaN(value) || !Number.isInteger(value)) {
    return { error: INVALID_COUNT_MESSAGE };
  }

  if (value < 0) {
    return { error: NEGATIVE_COUNT_MESSAGE };
  }

  if (value > MAX_REVIEW_COUNT) {
    return { error: RANGE_COUNT_MESSAGE };
  }

  return { count: value };
}

export function parseCountInput(value: string): CountValidationResult | { count?: undefined; error?: never } {
  const trimmed = value.trim();

  if (trimmed === "") {
    return {};
  }

  const parsed = Number(trimmed);
  return validateCountValue(parsed);
}
