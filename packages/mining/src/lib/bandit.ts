/**
 * Draw a random sample from Beta(alpha, beta) using the Johnk method.
 * This rejection sampler is suitable for alpha, beta >= 1.
 */
export function thompsonSample(alpha: number, beta: number): number {
  while (true) {
    const u = Math.random();
    const v = Math.random();
    const x = u ** (1 / alpha);
    const y = v ** (1 / beta);

    if (x + y <= 1) {
      return x / (x + y);
    }
  }
}
