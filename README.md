# payload-puck-advance

[![npm](https://img.shields.io/npm/v/payload-puck-advance?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/payload-puck-advance)
[![Payload CMS](https://img.shields.io/badge/Payload_CMS-3.88-000000?style=for-the-badge&logo=payloadcms&logoColor=white)](https://payloadcms.com)
[![Puck](https://img.shields.io/badge/Puck-0.23-5A67D8?style=for-the-badge)](https://puckeditor.com)
[![Next.js](https://img.shields.io/badge/Next.js-15_%7C%2016-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520.9-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9_%7C%2010_%7C%2011-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![SWC](https://img.shields.io/badge/SWC-bundler-FFCF00?style=flat-square&logo=swc&logoColor=black)](https://swc.rs/)
[![ESLint](https://img.shields.io/badge/ESLint-9-4B32C3?style=flat-square&logo=eslint&logoColor=white)](https://eslint.org/)

A Puck canvas for Payload CMS that acts as a **bridge**, not as a design system.

Payload owns the block definitions. Payload's own form is where blocks are added and
arranged. Puck **only renders**, and its field panel is derived from those same block
definitions at runtime.

This package ships no blocks, no components, no tokens, and no CSS.

```ts
payloadPuckAdvance({
  collections: ['pages'],
  puckViewComponent: '@/components/PuckView#PuckView',
})
```

## Why it is shaped this way

The first version of this package shipped a contract layer of its own: a five-tier
taxonomy, a built-in section catalogue, CSS tokens, and a normalisation layer between
Payload and the frontend. All of it was removed, for three reasons that only became
apparent in real use:

1. **Two sources of truth.** Adding a single field meant editing the contract, the
   Payload block, and the render component — three places that had to be kept in sync
   by hand. Whichever one was forgotten did not raise an error; it simply went missing.
2. **A catalogue the project did not own.** The canvas offered sections that never
   appeared in the default form, so editors could assemble pages that could not be
   edited anywhere else.
3. **A third shape.** The normalisation layer became a third data shape alongside the
   Payload document and the component props — and it was invariably the third shape
   that fell behind.

What remains is one source of truth (the Payload block definitions), one data shape
(the `blocks` rows exactly as stored), and one set of components, used by both the
frontend and the canvas.

## How it works

```
src/blocks/Hero.ts          Payload block definition      ← THE single source of truth
      │
      ├──→ Payload's default form      (add and arrange blocks)
      ├──→ Puck field panel            (derived at runtime by this package)
      └──→ src/blocks/render.tsx       (React components)
                 │
                 ├──→ production frontend   via <BlockRenderer />
                 └──→ Puck canvas           via renderMap
```

What this package does, and nothing beyond it:

- reads block definitions from Payload's client config (`useConfig()`) and derives
  Puck's `config.components` from them
- maps `blocks` rows to Puck data and back again
- mounts a full-viewport document view at
  `/admin/collections/<slug>/<id>/puck`
- replaces the Live Preview eye icon with a three-mode selector
- loads and saves through Payload's REST API, honouring drafts and versions
- optionally revalidates the frontend on publish

The Puck catalogue is **deliberately empty** (`Puck.Components` is never rendered).
Blocks are added in the default form; the canvas exists to arrange and edit what is
already there.

## Installation

```bash
pnpm add payload-puck-advance   # or: npm i / yarn add
npx payload-puck-advance init --dry-run   # inspect the plan first
npx payload-puck-advance init
pnpm generate:importmap
```

`init` writes files that **belong to your project** — example block definitions,
render components, a `Pages` collection, a data client, and the frontend routes — and
then patches `payload.config.ts`. Those files are marked as yours: a subsequent `init`
will not overwrite them without `--force`.

Prefer to wire it up by hand? The minimum required is:

1. A collection with a `blocks` field (named `layout` by default) and
   `versions: { drafts: true }`.
2. `src/blocks/render.tsx` — a map of `blockType` to React component.
3. `src/components/PuckView.tsx`:

   ```tsx
   'use client'
   import { createPuckView } from 'payload-puck-advance/client'
   import { blockComponents } from '@/blocks/render'

   export const PuckView = createPuckView({ renderMap: blockComponents })
   ```

4. The plugin in `payload.config.ts`, as shown at the top of this document.

## Options

| Option                 | Required | Default                                            | Description                                                       |
| ---------------------- | -------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| `collections`          | ✔        | —                                                  | Slugs of the collections to attach to. They must already exist.    |
| `puckViewComponent`    | ✔        | —                                                  | Path to your application's Puck view component.                   |
| `field`                |          | `'layout'`                                         | Name of the `blocks` field to edit.                               |
| `previewModeComponent` |          | `'payload-puck-advance/client#PreviewModeSelect'`  | The mode selector; replace it to supply your own UI.               |
| `puckViewPath`         |          | `'/puck'`                                          | Path of the document view.                                        |
| `revalidate`           |          | `false`                                            | `{ secret, url, headers? }` — called on publish.                  |
| `disabled`             |          | `false`                                            | Skip the plugin entirely, for use behind a feature flag.          |

The plugin **fails at boot** if `collections` is empty, if a slug is absent from the
config, or if the target collection has no `blocks` field under the configured name.
This is deliberate: a silent failure here surfaces much later as an empty canvas with
no discernible cause.

`createPuckView` accepts `renderMap` (required), `fieldName`, `fullScreen`,
`stylesheetFrom`, `syncHostStyles`, and `iframeOverride`.

## Supported field types

Derived automatically into Puck fields:

`text` · `textarea` · `number` · `select` · `radio` · `checkbox` · `array` ·
`group` · `blocks` (becomes a slot) · `row`/`collapsible`/`tabs` (flattened)

**Deliberately not** offered in Puck: `richText`, `upload`, `relationship`, `join`,
`date`, `point`, `code`, `json`, `ui`.

`richText` is the most consequential entry on that list. Its value is Lexical JSON;
presenting it as a textarea would allow an editor to overwrite it with plain text and
destroy the content without warning. Fields of this kind continue to be edited in the
default form — Puck simply does not offer them, and their values are left untouched
when saving from the canvas.

`checkbox` becomes a two-value radio, because Puck has no boolean field.

## Three editing modes, without a new field

The Live Preview eye icon is replaced by a selector offering three modes:

| Option           | Behaviour                             |
| ---------------- | ------------------------------------- |
| **Form**         | Payload's default form (the default)  |
| **Live Preview** | Payload's Live Preview, unmodified    |
| **Puck**         | opens the Puck view in a **new tab**  |

### Why not the `PreviewButton` slot

`PreviewButton` is only rendered when `admin.preview` is configured, whereas the eye
icon in question is `button.live-preview-toggler`, which has no replacement slot at
all. The selector is therefore mounted through `beforeDocumentControls`, alongside a
single CSS rule that hides the original toggler — one line of CSS rather than a fork
of an admin component.

### Why Puck opens in a new tab

The difference is one of context, not merely of appearance: the canvas maintains its
own selection state, undo history, and save action. Stacking it on top of the form
would nest two forms (`Puck.Fields` always renders a `<form>`, and Payload's entire
document layout already sits inside one), which produces a hydration error rather than
merely invalid HTML.

Once the tab is open, the selector does **not** switch to `puck`. The original tab
still shows the form, and labelling it "Puck" would misrepresent what is on screen.

### Full viewport, not the space left below the admin shell

Payload does not permit `views.edit.root` to coexist with custom views. The Puck view
is therefore rendered as a `position: fixed` layer covering the viewport, with body
scrolling locked while it is active. The result is equivalent to taking over the page,
without giving up the custom view.

### The Puck view header

A back link to the document, the document status, a status selector
(`#puck-advance-status`), and a save button (`#puck-advance-save`).

Saving issues `PATCH ...?draft=true`. With `_status: 'draft'` the write lands only in
the versions table; with `_status: 'published'` the document is genuinely published —
`draft=true` in the URL does not prevent it.

Those `id` attributes exist for the benefit of the test suite: the save button's label
follows the document status, so a text-based selector would make the suite depend on
state it does not control.

### Canvas CSS: borrowed from the frontend, not copied

Puck's canvas iframe is empty, and `syncHostStyles` pulls in the **admin** stylesheet
rather than the frontend's. The visible symptom is a canvas showing unstyled text
while Live Preview renders correctly.

The remedy: when the canvas opens, the frontend page (`stylesheetFrom`, default `/`)
is fetched, its stylesheet tags are read, and they are injected into the iframe via
`overrides.iframe`. Nothing is copied into this package, so a change to the frontend
theme reaches the canvas without any rebuild.

## Writing blocks

An ordinary Payload definition, with nothing Puck-specific about it:

```ts
export const Hero: Block = {
  slug: 'hero',
  fields: [{ name: 'heading', type: 'text', label: 'Heading', required: true }],
  labels: { plural: 'Hero', singular: 'Hero' },
}
```

The component is used in two contexts, and it must be the **very same** component:

```tsx
export const blockComponents = { hero: Hero as BlockComponent }
```

The map keys must match the block slugs. That is where the frontend and the canvas
meet; if the canvas uses different components, it displays something that will never
be served.

### Slots (blocks within blocks)

A `blocks` field inside a block becomes a Puck slot. The component receives two
props: the slot contents (an array on the frontend, a component in the canvas) and
`renderSlot`:

```tsx
export const Grid = ({ items, renderSlot }: { items?: unknown; renderSlot?: (v: unknown) => ReactNode }) => (
  <div className="grid gap-6 md:grid-cols-2">{renderSlot ? renderSlot(items) : null}</div>
)
```

**Do not** define a slot that admits blocks which themselves contain slots, including
the block itself. `blockReferences` does not break the recursion: "a Column inside a
Column" has no base case, and the definition expands until it fails at boot with
`Maximum call stack size exceeded`. The consequence is a single level of nesting — a
limit chosen deliberately, not a defect.

### The golden rule: no outer margins

A block component controls its own internal padding and never its outer margin.
Spacing between blocks is a decision belonging to the page, not to the block: as soon
as one block carries `mt-*`, blocks can no longer be freely reordered.

## Notes that will save you time

**Tailwind v4 does not scan `node_modules`.** For as long as this package shipped its
own components, their classes were silently dropped from the compiled stylesheet — the
symptom being an unstyled page whose HTML nevertheless contains the correct classes.
Every class now lives in the project's `src`, so `@source` is no longer required. Move
block components into a package of your own and the trap returns.

**Postgres identifiers are limited to 63 characters.** Nested blocks produce enum
names such as `enum_layout_pages_v_blocks_..._new_tab`, which exceed the limit and
cause the schema push to fail. Shorten the field names, or set `dbName` and `enumName`
explicitly.

**`export const dynamic` must be a literal.** Next reads it statically;
`dynamic = route.dynamic` is ignored without warning, leaving the preview route
eligible for caching — which means drafts can be served from cache.

**Do not build this package while the dev server is running.** Payload is reading
`dist/`, and the mildest consequence is a module disappearing mid-request. `build`
also runs `clean` first, because `swc` does not prune files whose sources have been
deleted; without it, stale code lingers in `dist` and presents itself as a change that
refuses to take effect.

## CLI: `payload-puck-advance init`

Detected automatically: the package manager, `src/`, the App Router directory, the
route group, the import alias from `tsconfig.json`, the location of
`payload.config.ts`, and whether the `pages` slug is already taken (in which case
`puck-pages` is used).

Guarantees: `--dry-run` writes nothing; existing files are never overwritten without
`--force` (which creates a `.bak`); the command is safe to run again; and it reports a
manual step in preference to guessing.

Config patching is performed by text search rather than by rewriting the TypeScript
AST. An AST-based approach looks more capable, but real-world Payload configs vary
considerably — wrapped in functions, spread from other files, plugins produced by
`.map()` — and that is precisely where an AST fails quietly. Text search fails
openly: where it is not confident, it declines to touch the file and prints a snippet
to paste.

The patcher inserts three things: the plugin import, `Pages` into the `collections`
array (mandatory — the plugin throws if the slug is not registered), and `livePreview`
into `admin`. Place a `// @puck-advance:plugins` comment inside the `plugins` array to
choose the insertion point yourself.

Without an import alias, component paths in the config are resolved relative to
`admin.importMap.baseDir`, a value that cannot be inferred from the outside. The CLI
reports this as a warning rather than guessing.

## Runtime verification

The end-to-end suite in `payload-boilerplate/tests/e2e/puck.e2e.spec.ts` (19 tests)
guards precisely the things that have broken before: the Puck catalogue must be
**empty**, the outline must contain only the page's actual contents, the field panel
must genuinely derive from the Payload block definitions, the full-viewport layer must
be in place, the canvas CSS must be applied, there must be no nested forms and no Next
error overlay, the back link and status selector must be present, and drafts and
publishes must write to the correct place.

## Support

If this package saved you time, a contribution is warmly appreciated — though never
expected. It goes towards keeping the package current with Payload's releases.

<a href="https://www.paypal.com/paypalme/sgkharianja" target="_blank">
  <img src="https://img.shields.io/badge/Donate-PayPal-0070BA?style=for-the-badge&logo=paypal&logoColor=white" alt="Donate with PayPal" height="40"/>
</a>
&nbsp;&nbsp;
<a href="https://saweria.co/rhioharianja" target="_blank">
  <img src="https://img.shields.io/badge/Saweria-Donate-F97316?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Donate via Saweria" height="40"/>
</a>

Bug reports and pull requests are equally valuable, and free:
[open an issue](https://github.com/rhyoharianja/payload-puck-advance/issues).

## License

MIT © Suryo Galih Kencana Harianja. See [LICENSE](LICENSE).
