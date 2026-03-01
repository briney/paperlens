export { registerAnalyzer, getAnalyzer, getAllAnalyzers } from "./registry";
export type { Analyzer, AnalyzerContext, AnalyzerResult } from "./types";

// Import analyzers to trigger self-registration
import "./summarizer";
