import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from './App';

test('initial render is loading rather than empty or disconnected', () => {
  const markup = renderToStaticMarkup(createElement(App));
  expect(markup).toContain('data-bootstrap="loading"');
  expect(markup).toContain('data-connection="loading"');
  expect(markup).not.toContain('data-bootstrap="unavailable"');
  expect(markup).not.toContain('data-tasks="empty"');
});
