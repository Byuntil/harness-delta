import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from './App';

test('navigation follows onboarding, tasks and setup with current-page semantics', () => {
  const markup = renderToStaticMarkup(createElement(App));
  const navigation = markup.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
  expect([...navigation.matchAll(/data-screen="([^"]+)"/g)].map(match => match[1])).toEqual(['intro', 'tasks', 'setup']);
  expect(navigation).toMatch(/data-screen="tasks"[^>]*aria-current="page"/);
  expect(navigation.match(/aria-current="page"/g)).toHaveLength(1);
});

test('initial render is loading rather than empty or disconnected', () => {
  const markup = renderToStaticMarkup(createElement(App));
  expect(markup).toContain('data-bootstrap="loading"');
  expect(markup).toContain('data-connection="loading"');
  expect(markup).not.toContain('data-bootstrap="unavailable"');
  expect(markup).not.toContain('data-tasks="empty"');
});
