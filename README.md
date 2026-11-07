# Ev-Cabinet

[한국어 안내 — 한글.md](./한글.md)

A bilingual developer homepage with a shared project support page. Editable source, generated static output and browser verification tools live together in this repository.

## Edit once, generate every page

| Source | Responsibility |
| --- | --- |
| [src/data/site.json](./src/data/site.json) | Site identity, links, routes, navigation, projects and payment destinations |
| [src/locales/](./src/locales/) | English/Korean copy, with shared UI strings and named placeholders |
| [src/templates/](./src/templates/) | Semantic home and support layouts |
| [src/runtime/](./src/runtime/) | Encapsulated preference, language and project controllers |
| [src/styles/](./src/styles/) | Design tokens and responsive styles |
| [project.config.json](./project.config.json) | Build, preview, verification and publication settings |

The detailed [source editing guide](./src/data/README.md) explains each setting and the runtime flow in Korean. Business values are defined in data, rather than duplicated across JavaScript and generators. Generated HTML naturally contains resolved values; edit the source data instead of those output files.

## Development

Use Node.js 22.12 or newer and pnpm. Browser checks require Chrome; set CHROME_PATH if it is installed outside the configured candidate paths.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check:generated
pnpm test
pnpm preview
```

The preview prints its address. Its host/port and output directory come from project.config.json; EV_CABINET_PREVIEW_PORT can override the port. The local working copy writes to website/, while the published repository writes static output to its root through the publication configuration.

In a second terminal, run pnpm verify:home, verify:header, verify:locale, verify:projects, verify:home-support, verify:paypal and verify:history. Reports and screenshots go to the configured evidence directory using the configured time zone. EV_CABINET_VERIFY_ORIGIN selects another origin for browser checks.

## Behavior

Home and support use the same navigation and language preference: explicit URL selection, saved manual selection, the first supported browser language, then the configured default. Query strings, fragments, storage-denied use and browser Back/forward cache restoration are preserved. Native language/payment links work without JavaScript.

Support offers all projects, QuietMic and MDownloader. Each choice opens its separately named real payment item. Contributions remain voluntary, one-time, customer-priced support for the shared project effort. The project catalog generates both the interactive choices and no-script links.

Builds validate data, escape text and inline JSON, bundle only the required page functionality, minify CSS and version assets by content. They do not require a framework or a server at runtime. Existing app images and visual design are preserved.

## Publication

pnpm prepare:publish checks generated output and assembles static files plus editable source in the configured staging directory. It does not push. Commit the prepared files to the configured Pages branch. Check that exact deployment with node tools/watch-publication.mjs followed by its full commit SHA, then run pnpm verify:published to compare live files and browser behavior.

GitHub Pages serves the already generated files. A clean checkout can reproduce them with the build command; the same build tool supports both local and repository-root output without rewriting source code.
