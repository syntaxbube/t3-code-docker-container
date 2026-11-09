import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { DotPattern } from "../components/ui/dot-pattern";
import { DotPatternDemo } from "../components/ui/demo";

test("multiple patterns reference their own unique SVG paint server", () => {
  const html = renderToStaticMarkup(<div><DotPattern /><DotPattern width={32} cr={2} /></div>);
  const ids = [...html.matchAll(/<pattern id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  for (const id of ids) assert.ok(html.includes(`fill="url(#${id})"`));
  assert.match(html, /width="32"/);
  assert.match(html, /r="2"/);
});

test("the supplied demo renders its masked background without a provider", () => {
  const html = renderToStaticMarkup(<DotPatternDemo />);
  assert.match(html, /Dot Pattern/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /mask-image:radial-gradient/);
});
