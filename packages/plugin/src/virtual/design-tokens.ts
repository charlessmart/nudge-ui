export interface TokenEntry {
  name: string;
  value: string;
  source: string;
  adapter?: string;
}

export const tokenTable: Record<string, TokenEntry> = {};

export default tokenTable;