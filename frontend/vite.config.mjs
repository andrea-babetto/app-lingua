import path from "node:path";
import { defineConfig, loadEnv, transformWithOxc } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// JSX lives in .js files (App.js, index.js). Vite picks the language from the extension,
// so .js files under src/ are compiled as JSX here.
function jsxInJs() {
  return {
    name: "jsx-in-js",
    enforce: "pre",
    async transform(code, id) {
      const [file] = id.split("?");
      if (!/\/src\/.*\.js$/.test(file) || file.includes("/node_modules/")) return null;
      return transformWithOxc(code, file, { lang: "jsx", jsx: { runtime: "automatic" } });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Reads frontend/.env* and the real environment (e.g. variables set on the hosting dashboard).
  const env = loadEnv(mode, __dirname, ["REACT_APP_", "VITE_"]);

  // App code reads `process.env.REACT_APP_*`; Vite has no process.env in the browser, so each
  // REACT_APP_ key is inlined at build time. REACT_APP_BACKEND_URL is always defined (empty =
  // same origin as the page) so a missing value never becomes a runtime "process is not defined".
  const define = Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => key.startsWith("REACT_APP_"))
      .map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)]),
  );
  if (!("process.env.REACT_APP_BACKEND_URL" in define)) {
    define["process.env.REACT_APP_BACKEND_URL"] = '""';
  }

  return {
    plugins: [jsxInJs(), react(), tailwindcss()],
    envPrefix: ["VITE_", "REACT_APP_"],
    define,
    resolve: {
      alias: [{ find: "@", replacement: path.resolve(__dirname, "./src") }],
    },
    // The dependency scanner runs without user plugins: tell it that src/**/*.js carries JSX.
    optimizeDeps: { rolldownOptions: { moduleTypes: { ".js": "jsx" } } },
    build: { outDir: "build" },
    server: { host: true, port: 3000 },
  };
});
