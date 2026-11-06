import { createContext, useContext, type ReactNode } from "react";

const ProbeThemeContext = createContext<{ accent: string } | null>(null);

export function ProbeThemeProvider({ children }: { children?: ReactNode }) {
  return <ProbeThemeContext.Provider value={{ accent: "teal" }}>{children}</ProbeThemeContext.Provider>;
}

export interface ThemeProbeProps {
  size?: "small" | "large";
  children?: ReactNode;
}

export function ThemeProbe({ size = "small", children }: ThemeProbeProps) {
  const theme = useContext(ProbeThemeContext);
  if (!theme) throw new Error("useProbeTheme must be used within ProbeThemeProvider");
  return <span style={{ color: theme.accent, fontSize: size === "large" ? 24 : 14 }}>{children}</span>;
}
