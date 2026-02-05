export function toISOStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
