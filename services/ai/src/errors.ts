/**
 * No reply possible (model down, broken output). Backend should catch and show
 * a friendly retry message, never the raw error.
 */
export class AIServiceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AIServiceError";
  }
}
