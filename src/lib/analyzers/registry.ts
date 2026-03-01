import type { Analyzer } from "./types";

const analyzers = new Map<string, Analyzer>();

export function registerAnalyzer(analyzer: Analyzer) {
  analyzers.set(analyzer.type, analyzer);
}

export function getAnalyzer(type: string): Analyzer | undefined {
  return analyzers.get(type);
}

export function getAllAnalyzers(): Analyzer[] {
  return Array.from(analyzers.values());
}
