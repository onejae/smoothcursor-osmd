import { defineConfig } from "vite";
export default defineConfig({
  build: {
    assetsDir: ".",
    lib: {
      name: "smoothcursorosmd",
      entry: "src/main.ts",
      fileName: "smoothcursorosmd",
    },
  },
});
