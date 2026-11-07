# Ev-Cabinet

[한국어 안내 — 한글.md](./한글.md)

Personal developer homepage for [evilack](https://github.com/evilack), featuring QuietMic and selected work.

- Website: https://evilack.github.io/
- QuietMic: https://github.com/evilack/QuietMic
- Career portfolio: https://evilack.github.io/portfolio/
- Shared developer support: https://evilack.github.io/donate.html

## Pages and language selection

The site is buildless and published with GitHub Pages from the main branch root.

| Page | English default | Korean |
| --- | --- | --- |
| Home | index.html | index-ko.html |
| Shared support | donate.html | donate-ko.html |

donate-en.html is a compatibility address whose canonical is donate.html.
Language priority is explicit URL (?lang=en or ?lang=ko), saved manual choice,
the first supported browser language, then English. Manual choices are shared
between home and support. Native language and payment links work without JavaScript.

## Shared navigation

Edit tools/site-header.mjs, then run:

```sh
node tools/sync-site-header.mjs
node tools/sync-site-header.mjs --check
```

The shared source updates all five static pages. Navigation contains Work,
Portfolio, Support and the language switch. The original QuietMic images,
developer introduction and portfolio destination are preserved.

## Support

Support is voluntary and shared across all Ev-Cabinet apps and projects.
Enter your preferred USD amount directly on PayPal for a one-time contribution,
without an automatically renewing subscription.

Choose All Ev-Cabinet projects, QuietMic, or MDownloader. Each choice uses a
separately named PayPal payment item so the project can be identified in the
payment details. This expresses a project preference; contributions still
support Ev-Cabinet as a whole.

Edit support-projects.js to maintain the public project/payment catalog, then run:

```sh
node tools/sync-support-projects.mjs
```

## Local preview

Serve this directory with any static HTTP server. For example, with Python installed:

```sh
python -m http.server 4174 --bind 127.0.0.1
```
