import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { GuidedSetup } from './GuidedSetup';

test('local skill-copy controls remain available while server actions are unavailable', () => {
  const markup = renderToStaticMarkup(createElement(GuidedSetup, {
    locale: 'ko', setups: [], busy: true,
    perform: () => Promise.resolve(null), onSaved: () => undefined,
  }));
  const buttons = Array.from(markup.matchAll(/<button\b[^>]*data-copy-skill="([^"]+)"[^>]*>/g));
  expect(buttons.map(button => button[1])).toEqual(['harness-register', 'harness-compare-config']);
  for (const button of buttons) expect(button[0]).not.toMatch(/\sdisabled(?:=|\s|>)/);
  expect(markup).toMatch(/<input\b[^>]*id="guided-comparison"[^>]*disabled=""/);
  expect(markup).not.toContain('data-setup-review="ready"');
});
