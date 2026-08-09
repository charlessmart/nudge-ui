import type { Config } from "tailwindcss";

export const tailwindConfig: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#123456",
        accent: "#abcdef",
      },
      spacing: {
        3: "0.75rem",
      },
    },
  },
  plugins: [],
};

export default tailwindConfig;

