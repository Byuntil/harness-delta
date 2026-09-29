# Synthetic adapter cases

These minimal metadata-only examples are handwritten. They omit content-bearing
fields deliberately and are not a full transcript schema or a support claim.
They exercise the registered Codex 0.156.1 and Claude Code 2.1.283 profiles.
They are not admission evidence for 0.158.0.
The final two records in each file are adversarial, invented shapes, not observed
product events. See [capability evidence](../../../docs/decisions/001-adapter-capabilities.md).

- Codex records 1–2: a zero-origin synthetic cumulative sequence has totals
  input 160, cached input 60, output 50. The second delta is 60/20/20.
  A collector starting at record 1 must baseline it, not backfill its 100/40/30.
- Codex record 3: exact replay adds nothing.
- Codex record 4: counter decrease; unmeasurable reset boundary, not -150 input
  and not observed zero. A new epoch needs independent evidence.
- Claude records 1–2: independent messages have total inputs 60 and 62 and outputs
  5 and 3. Combined input is 122, output 8. The smaller ordinary input on record 2
  is not a cumulative reset.
- Claude record 3: exact replay adds nothing; message revisions/conflicting payloads
  still need their own tests and live validation.
- Unverified child: reject automatic linkage and do not count usage.
- Unknown format: report unsupported, not a successful zero observation.

Missing reasoning is missing, not zero. Pause, rotation, compaction, nonzero
reasoning, and parent-inclusive counters are not established by these fixtures.
