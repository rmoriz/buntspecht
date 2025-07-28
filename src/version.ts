/**
 * Centralized version configuration for Buntspecht
 * This is the single source of truth for the application version
 */
export const VERSION = {
  major: 0,
  minor: 18,
  patch: 0,
  
  toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  },
  
  toJSON(): string {
    return this.toString();
  }
} as const;

export default VERSION;