import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { SessionUsageTable } from '../ui/src/SessionUsageTable.js';
import type { BindingSummary } from '../ui/src/types.js';

const missing: BindingSummary = { requests: null, input_total: { status: 'missing', value: null, statuses: [], reasons: [] },
  output_total: { status: 'missing', value: null, statuses: [], reasons: [] }, partial_amount: null, currency: null,
  unpriced_events: 0, price_table_id: null, complete_cost: null };
for (const locale of ['en', 'ko'] as const) {
  test(`actual ${locale} table renders agent metadata, separate models, safe text and legacy fallback`, () => {
    const markup = renderToStaticMarkup(createElement(SessionUsageTable, { locale, summary: missing, sessions: [
      { ...missing, session_id: 'root', parent_session_id: null },
      { ...missing, session_id: 'named', parent_session_id: 'root', agent_metadata: { source: 'codex_session_meta', nickname: '<b>Cedar</b>', role: 'reviewer' }, models: ['model-a', 'model-b'] },
      { ...missing, session_id: 'legacy', parent_session_id: 'root' },
    ] }));
    expect(markup).toContain(locale === 'en' ? '<th>Model</th>' : '<th>모델</th>');
    expect(markup).toContain('&lt;b&gt;Cedar&lt;/b&gt; [reviewer]');
    expect(markup).not.toContain('<b>Cedar</b>');
    expect(markup).toContain('<td>model-a, model-b</td>');
    expect(markup).toContain(locale === 'en' ? 'Child 2' : '자식 2');
    expect(markup).toContain(locale === 'en' ? 'Unknown' : '알 수 없음');
    expect(markup).toContain('colSpan="2"');
  });
}
