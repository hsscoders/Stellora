/** Standalone HTTP error class (kept dependency-free to avoid import cycles). */
export class HttpError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}
