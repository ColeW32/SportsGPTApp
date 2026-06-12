export class FreeLimitReachedError extends Error {
  constructor() {
    super("You've used all your free asks.");
  }
}

export class ServerError extends Error {}

export class EmptyResponseError extends Error {}
