export interface ConformanceCandidate {
  readonly kind: 'conformance_candidate';
  readonly product: 'codex';
  readonly version: '0.158.0';
  readonly admitted: false;
  readonly counterMode: 'cumulative_total';
  readonly productionUsageField: 'total_token_usage';
  readonly inspectedUsageField: 'last_token_usage';
  readonly recognizedTypes: readonly [
    'session_meta', 'event_msg', 'response_item', 'world_state',
    'turn_context', 'token_usage_record', 'compacted',
  ];
  readonly blockingTypes: readonly ['compacted'];
  readonly excludedTypes: readonly ['token_usage_record'];
  readonly requiredTotalFields: readonly [
    'input_tokens', 'cached_input_tokens', 'output_tokens',
    'reasoning_output_tokens', 'cache_write_input_tokens',
  ];
}

export const codex01580Candidate = {
  kind: 'conformance_candidate',
  product: 'codex',
  version: '0.158.0',
  admitted: false,
  counterMode: 'cumulative_total',
  productionUsageField: 'total_token_usage',
  inspectedUsageField: 'last_token_usage',
  recognizedTypes: [
    'session_meta', 'event_msg', 'response_item', 'world_state',
    'turn_context', 'token_usage_record', 'compacted',
  ],
  blockingTypes: ['compacted'],
  excludedTypes: ['token_usage_record'],
  requiredTotalFields: [
    'input_tokens', 'cached_input_tokens', 'output_tokens',
    'reasoning_output_tokens', 'cache_write_input_tokens',
  ],
} as const satisfies ConformanceCandidate;
