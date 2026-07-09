export interface TokenEntry {
  name: string;
  value: string;
  source: string;
  adapter?: string;
}

export const tokens: TokenEntry[] = [];
export default tokens;