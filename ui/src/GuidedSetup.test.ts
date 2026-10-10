import { createElement, isValidElement, useRef, useState, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { SetupReviewResult } from '../../src/local-web-setup-review.js';
import { Button } from '@/components/ui/button';
import { GuidedSetup, measurementSettingIdentifier } from './GuidedSetup';

vi.mock('react', async importOriginal => {
  const react = await importOriginal<typeof import('react')>();
  return { ...react, useState: vi.fn(react.useState), useRef: vi.fn(react.useRef) };
});

test.each([
  ['{"id":"new-setting"}', 'new-setting'],
  ['{"id":"edited-setting"}', 'edited-setting'],
])('new settings read the supplied profile identifier from %s', (profile, expected) => {
  expect(measurementSettingIdentifier('', profile)).toBe(expected);
});

test.each([undefined, '', ' ', '{', 'null', '[]', '{}', '{"id":null}', '{"id":12}', '{"id":""}'])(
  'new settings have no identifier when the profile is missing or invalid: %s',
  profile => { expect(measurementSettingIdentifier('', profile)).toBe(''); },
);

test.each(['{"id":"different-new-setting"}', '{'])('registered selection ignores a retained profile draft: %s', profile => {
  expect(measurementSettingIdentifier('registered-setting', profile)).toBe('registered-setting');
});

test('the settings identifier is displayed without a second editable input', () => {
  const markup = renderToStaticMarkup(createElement(GuidedSetup, {
    locale: 'ko', setups: [], busy: false,
    perform: () => Promise.resolve(null), onSaved: () => undefined,
  }));
  expect(markup).toMatch(/<input\b[^>]*id="guided-template-id"[^>]*readonly=""/i);
  expect(markup).toMatch(/<input\b[^>]*id="guided-template-id"[^>]*aria-describedby="guided-identifier-help"/);
});

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

test('a review response cannot restore an invalidated review after a profile file completes', async () => {
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  let stateIndex = 0;
  let refIndex = 0;
  vi.mocked(useState).mockImplementation((initial?: unknown) => {
    const index = stateIndex++;
    if (index === states.length) states.push(initial);
    return [states[index], (value: unknown) => {
      states[index] = typeof value === 'function' ? Reflect.apply(value, undefined, [states[index]]) : value;
    }];
  });
  vi.mocked(useRef).mockImplementation((initial: unknown) => refs[refIndex++] ??= { current: initial });
  function pending<T>() {
    let complete: (value: T) => void;
    const promise = new Promise<T>(resolve => { complete = resolve; });
    return { promise, resolve: (value: T) => complete(value) };
  }
  const file = pending<string>();
  const response = pending<SetupReviewResult | null>();
  const blocked: SetupReviewResult = { ready: false, issues: [{ field: 'profile.name', code: 'invalid_type' }] };
  const perform = vi.fn().mockReturnValueOnce(response.promise).mockResolvedValueOnce(blocked);
  type Control = {
    id?: string; value?: string; children?: ReactNode; 'aria-label'?: string;
    'data-copy-skill'?: string; 'data-setup-review'?: string;
    onChange?: (event: { target: { value: string; files?: { text: () => Promise<string> }[] } }) => void;
    onClick?: () => void;
  };
  function controls(node: ReactNode): { type: unknown; props: Control }[] {
    if (Array.isArray(node)) return node.flatMap(controls);
    if (!isValidElement<Control>(node)) return [];
    return [node, ...controls(node.props.children)];
  }
  function render(busy = false) {
    stateIndex = 0; refIndex = 0;
    return controls(GuidedSetup({ locale: 'ko', setups: [], busy, perform, onSaved: vi.fn() }));
  }
  function input(id: string) {
    const control = render().find(node => node.props.id === id);
    if (!control?.props.onChange) throw new Error(`Missing input ${id}`);
    return control.props.onChange;
  }
  function reviewButton() {
    const control = render().find(node => node.type === Button && !node.props['data-copy-skill']);
    if (!control?.props.onClick) throw new Error('Missing review action');
    return control.props.onClick;
  }
  try {
    input('guided-comparison')({ target: { value: '/synthetic/comparison.json' } });
    input('guided-profile')({ target: { value: '{"id":"synthetic-old"}' } });
    const upload = render().find(node => node.props['aria-label'] === 'profile JSON file');
    if (!upload?.props.onChange) throw new Error('Missing profile upload');
    upload.props.onChange({ target: { value: '', files: [{ text: () => file.promise }] } });
    reviewButton()();
    expect(perform.mock.calls[0]?.[1]).toMatchObject({ template_id: 'synthetic-old', profile: { id: 'synthetic-old' } });
    render(true);

    // Both continuations subscribe to the same promise before its controlled completion.
    const fileCompleted = file.promise.then(() => undefined);
    file.resolve('{"id":"synthetic-new"}');
    await fileCompleted;
    expect(render(true).find(node => node.props.id === 'guided-template-id')?.props.value).toBe('synthetic-new');
    const responseCompleted = response.promise.then(() => undefined);
    response.resolve(blocked);
    await responseCompleted;
    expect(render().some(node => node.props['data-setup-review'])).toBe(false);

    reviewButton()();
    await perform.mock.results[1]?.value;
    expect(perform.mock.calls[1]?.[1]).toMatchObject({ template_id: 'synthetic-new', profile: { id: 'synthetic-new' } });
    expect(render().some(node => node.props['data-setup-review'] === 'blocked')).toBe(true);
  } finally { vi.mocked(useState).mockReset(); vi.mocked(useRef).mockReset(); }
});
