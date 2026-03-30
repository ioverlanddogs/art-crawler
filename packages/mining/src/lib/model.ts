const defaultWeights = { hasTitle: 0.4, httpsSource: 0.2, knownPlatform: 0.3 };

export function inferScore(signals: Record<string, number>, model = defaultWeights, intercept = -0.1) {
  const linear = Object.entries(signals).reduce((acc, [k, v]) => acc + (model[k as keyof typeof model] ?? 0) * v, intercept);
  return 1 / (1 + Math.exp(-linear));
}
