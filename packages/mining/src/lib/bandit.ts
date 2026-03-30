/**
 * Draw a random sample from Beta(alpha, beta) using the Johnk method.
 * This rejection sampler is suitable for alpha, beta >= 1.
 */
export function thompsonSample(alpha: number, beta: number): number {
  let sample = 0;
  let accepted = false;

  while (!accepted) {
    const u = Math.random();
    const v = Math.random();
    const x = u ** (1 / alpha);
    const y = v ** (1 / beta);

    if (x + y <= 1) {
      sample = x / (x + y);
      accepted = true;
    }
  }

  return sample;
}
