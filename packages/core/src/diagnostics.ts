export interface Span {
  start: number;
  end: number;
}

export type Severity = 'error' | 'warning' | 'info';

/** Language errors are data, never exceptions. */
export interface Diagnostic {
  severity: Severity;
  message: string;
  span: Span;
  /** Which file the diagnostic belongs to. */
  file?: FileRole;
  /** For 'include': the path as written in the `include` op. */
  path?: string;
}

/** 'include': a file included into the deck with `include` (see `path`). */
export type FileRole = 'deck' | 'theme' | 'include';

export function diag(severity: Severity, message: string, span: Span, file?: FileRole): Diagnostic {
  return file ? { severity, message, span, file } : { severity, message, span };
}

export function spanOf(a: Span, b: Span): Span {
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}
