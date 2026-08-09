module.exports = {
  plugins: {
    // Keep PostCSS pointed at the exact config file imported by vite.config.ts.
    tailwindcss: { config: "./tailwind.config.ts" },
    autoprefixer: {},
  },
};
