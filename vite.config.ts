import esbuild from "esbuild";
import fs from "fs-extra";
import * as Vite from "vite";
import checker from "vite-plugin-checker";
import { viteStaticCopy } from "vite-plugin-static-copy";
import tsconfigPaths from "vite-tsconfig-paths";

const config = Vite.defineConfig(({ command, mode }): Vite.UserConfig => {
    const buildMode = mode === "production" ? "production" : "development";
    const outDir = "dist";

    const plugins = [checker({ typescript: true }), tsconfigPaths()];
    // Handle minification after build to allow for tree-shaking and whitespace minification
    // "Note the build.minify option does not minify whitespaces when using the 'es' format in lib mode, as it removes
    // pure annotations and breaks tree-shaking."
    if (buildMode === "production") {
        plugins.push(
            {
                name: "minify",
                renderChunk: {
                    order: "post",
                    async handler(code, chunk) {
                        return chunk.fileName.endsWith(".mjs")
                            ? esbuild.transform(code, {
                                  keepNames: true,
                                  minifyIdentifiers: false,
                                  minifySyntax: true,
                                  minifyWhitespace: true,
                                  sourcemap: true,
                              })
                            : code;
                    },
                },
            },
            ...viteStaticCopy({
                targets: [
                    { src: "LICENSE", dest: "." },
                    { src: "README.md", dest: "." },
                ],
            }),
        );
    } else {
        plugins.push(
            // Vite HMR is only preconfigured for css files: add handler for HBS templates
            {
                name: "hmr-handler",
                apply: "serve",
                handleHotUpdate(context) {
                    if (context.file.endsWith(".hbs") && !context.file.startsWith(outDir)) {
                        const basePath = context.file.slice(context.file.indexOf("templates/"));
                        console.log(`Updating template at ${basePath}`);
                        fs.promises.copyFile(context.file, `${outDir}/${basePath}`).then(() => {
                            context.server.ws.send({
                                type: "custom",
                                event: "template-update",
                                data: { path: `modules/babele/${basePath}` },
                            });
                        });
                    }
                },
            },
        );
    }

    // Create dummy files for vite dev server
    if (command === "serve") {
        const message = "This file is for a running vite dev server and is not copied to a build";
        fs.writeFileSync("./index.html", `<h1>${message}</h1>\n`);
        fs.writeFileSync("./babele.mjs", `/** ${message} */\n\nimport "./src/babele.ts";\n`);
    }

    return {
        base: command === "build" ? "./" : "/modules/babele/",
        publicDir: "static",
        define: {
            BUILD_MODE: JSON.stringify(buildMode),
            fu: "foundry.utils",
        },
        esbuild: { keepNames: true },
        build: {
            outDir,
            emptyOutDir: true,
            minify: false,
            sourcemap: true,
            lib: {
                name: "babele",
                entry: "src/main.ts",
                formats: ["es"],
                fileName: "babele",
            },
            rollupOptions: {
                output: {
                    entryFileNames: "babele.mjs",
                },
                watch: { buildDelay: 100 },
            },
            target: "es2022",
        },
        server: {
            port: 30001,
            proxy: {
                "^(?!/modules/babele/)": "http://localhost:30000/",
                "/socket.io": {
                    target: "ws://localhost:30000",
                    ws: true,
                },
            },
        },
        plugins,
        css: {
            devSourcemap: buildMode === "development",
        },
    };
});

export default config;
