// Flat config, native ESLint — no framework preset behind it.
//
// This replaced `eslint-config-next` in phase 7, once the Next dependency went
// away. What Next's preset was worth here was its TypeScript half; the rest
// (`next/core-web-vitals`) linted a router and an image component this project
// no longer has. So: typescript-eslint's recommended rules over the TS sources,
// and eslint-plugin-astro over the twelve `.astro` templates that hold most of
// the deck.
//
// One rule the old config turned off is worth recording rather than carrying:
// `@next/next/no-img-element` advised swapping `<img>` for `next/image`. That
// advice inverts here — `astro:assets` already emits the hashed WebP
// derivatives and the `srcset` the rule exists to get you, at build time, with
// no image endpoint in the request path. The plain `<img>` in
// `LoaderImage.astro` is the correct end state, not a shortcut. Nothing in the
// config below asks otherwise, so there is no longer an override to keep.

import js from "@eslint/js"
import tseslint from "typescript-eslint"
import astro from "eslint-plugin-astro"

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".astro/**",
      "dist/**",
      "build/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,

  // The `.astro` frontmatter is TypeScript, but astro-eslint-parser hands it
  // over without type information, so the type-aware half of typescript-eslint
  // does not apply. `no-unused-vars` also misfires on component props that the
  // template consumes, which the base plugin already handles.
  {
    files: ["**/*.astro"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },

  // Node scripts and config files run outside the browser.
  {
    files: ["**/*.mjs", "scripts/**", "tests/**", "*.config.{ts,mjs}"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
  },
)
