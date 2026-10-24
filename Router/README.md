# Client Router

A client-side router with path params, nested outlets, lazy routes and scroll restoration.

![Client Router preview](preview.png)

*A nested `/users/1` route rendered inside the Users outlet.*

## Features

- **Path params** (`:id`).
- **Nested outlets**: a parent renders its own chrome plus a `[data-outlet]` slot for the child.
- **Lazy-loaded routes** with a loading state.
- **Scroll restoration keyed to each history entry**, not the URL.
- An **in-memory history**, so it never rewrites the address bar of the page hosting it.

## How it works

Two visits to the same path keep separate scroll positions, because the position is stored per history entry. `back()` and `forward()` move through the router's own stack.

## Usage

```ts
const router = createRouter(routes, outletEl, scrollEl);
router.navigate('/users/42');
router.back();
```

## Run it

```bash
npx esbuild Router.ts --bundle --format=esm --outfile=Router.js
```

```html
<div id="app"></div>
<script type="module">
  import { mount } from './Router.js';
  mount(document.getElementById('app'));
</script>
```

There are no runtime dependencies: just the DOM and browser APIs.

## Files

| File | Purpose |
| --- | --- |
| [`Router.ts`](Router.ts) | Module plus a `mount()` demo |
| [`preview.png`](preview.png) | Screenshot of the running demo |
