import { useRef, useState } from 'react';
import { ArrowRight, Check, ClipboardPaste, Copy, Files, GitCompareArrows } from 'lucide-react';
import type { SetupReviewResult } from '../../src/local-web-setup-review.js';
import type { SharedSetupImport } from './SharedSetupPreview';
import type { Locale, Setup } from './types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function measurementSettingIdentifier(selected: string, profileDocument: string | undefined): string {
  if (selected) return selected;
  if (!profileDocument?.trim()) return '';
  try {
    const profile: unknown = JSON.parse(profileDocument);
    return typeof profile === 'object' && profile !== null && 'id' in profile && typeof profile.id === 'string' ? profile.id : '';
  } catch (error) {
    if (error instanceof SyntaxError) return '';
    throw error;
  }
}

export function GuidedSetup({ locale, setups, busy, perform, onSaved }: {
  locale: Locale; setups: Setup[]; busy: boolean;
  perform: <T>(route: string, input: unknown) => Promise<T | null>;
  onSaved: (value: SharedSetupImport) => void;
}) {
  const t = (en: string, ko: string) => locale === 'ko' ? ko : en;
  const [path, setPath] = useState('');
  const [template, setTemplate] = useState('');
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [freezeAt, setFreezeAt] = useState('');
  const [review, setReview] = useState<SetupReviewResult | null>(null);
  const [inputError, setInputError] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const inputRevision = useRef(0);
  const [copying, setCopying] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);
  const selectedTemplate = setups.find(setup => !setup.shared && setup.id === template);
  const identifier = measurementSettingIdentifier(selectedTemplate?.id ?? '', documents.profile);
  const skillSteps = [
    { skill: 'harness-register', icon: Files, title: t('Register harnesses', '하네스 등록'),
      description: t('Save the existing and modified harnesses as two versions.', '기존 하네스와 수정한 하네스를 각각 저장하세요.'),
      prompt: t(`Use harness-register to register the two selected harnesses as separate versions.

Project: [absolute project path]
Harness Delta checkout: [built tool checkout path; ask me if unknown]
Harness ID: [shared harness ID]
Intended use: [snapshot / agent_applied; ask me if undecided]

A — existing baseline
- Version: [baseline version name]
- Policy version: [baseline policy version]
- Primary instruction or application procedure: [project-relative file path]
- Supporting tools/documents: [project-relative file paths, or none]
- README source: [project-relative description file path]

B — modified harness
- Version: [modified version name]
- Policy version: [modified policy version]
- Primary instruction or application procedure: [project-relative file path]
- Supporting tools/documents: [project-relative file paths, or none]
- README source: [project-relative description file path]

If brackets remain, a file is missing, or a choice is unclear, ask me before registering. Never treat a placeholder as an actual value or invent missing inputs.
For agent_applied, confirm that the primary file describes how to apply the harness; a search guide alone may be insufficient.
Include only explicitly selected files. Check local references and ask me before adding referenced files. Preserve original files; do not create or modify a harness without a separate request.
Verify the saved versions and report their actual IDs, paths and hashes. Registration does not apply the harness or start measurement.`,
        `harness-register 스킬로 아래 두 하네스를 각각 다른 버전으로 등록해줘.

프로젝트: [프로젝트 절대경로]
Harness Delta 위치: [빌드된 도구 checkout 경로 — 모르면 나에게 질문]
하네스 ID: [공통 하네스 ID]
사용 방식: [snapshot / agent_applied — 모르면 나에게 질문]

A — 현재 기준 하네스
- 버전: [기준 버전 이름]
- 정책 버전: [기준 정책 버전]
- 주 지침 또는 적용 절차: [프로젝트 기준 상대경로]
- 포함할 도구·참고 문서: [프로젝트 기준 상대경로 목록 또는 없음]
- README 원본: [프로젝트 기준 설명 파일 상대경로]

B — 수정한 하네스
- 버전: [수정 버전 이름]
- 정책 버전: [수정 정책 버전]
- 주 지침 또는 적용 절차: [프로젝트 기준 상대경로]
- 포함할 도구·참고 문서: [프로젝트 기준 상대경로 목록 또는 없음]
- README 원본: [프로젝트 기준 설명 파일 상대경로]

대괄호가 남아 있거나 파일·선택이 불명확하면 등록 전에 나에게 질문해줘. 빈칸을 실제 값으로 취급하거나 임의로 채우지 마.
agent_applied라면 주 파일이 하네스 적용 방법을 설명하는지 확인해줘. 검색 가이드만으로 부족하면 필요한 절차를 나에게 확인해줘.
명시적으로 선택한 파일만 포함해줘. 로컬 참조를 확인하고 참조 파일을 추가할 때는 먼저 나에게 물어봐. 원본은 보존하고 별도 요청 없이 하네스를 새로 만들거나 수정하지 마.
저장한 두 버전을 검증하고 실제 ID·경로·해시를 알려줘. 등록만으로 하네스를 적용하거나 측정을 시작하지 마.`) },
    { skill: 'harness-compare-config', icon: GitCompareArrows, title: t('Create comparison JSON', '비교 파일 생성'),
      description: t('Choose the two saved versions as A and B.', '저장한 두 버전을 A와 B로 지정하세요.'),
      prompt: t(`Use harness-compare-config to create a comparison JSON from these registered versions.

Project: [absolute project path]
Harness Delta checkout: [built tool checkout path; ask me if unknown]
A — existing baseline: [registered baseline version name]
B — modified harness: [registered modified version name]
Comparison ID: [new comparison ID]
Display name: [comparison name]
Application mode: [snapshot / agent_applied; ask me if undecided]

If brackets remain, a required manifest or file is missing, or a choice is unclear, inspect the available manifests and ask me to select or confirm the missing inputs before generating. Do not guess IDs, switch A/B, create a harness or overwrite an existing comparison.
For snapshot, use format 1. For agent_applied, use format 2 with application=agent_applied and confirm that the selected harnesses contain application procedures.
Verify the saved JSON, then show its actual absolute path alone on one line in a code block for the UI. Keep references inside the JSON relative.
Do not invent measurement settings, dates, criteria, prices or runtime defaults. If reviewed local settings are missing, identify the required inputs separately; creating the comparison does not start application or measurement.`,
        `harness-compare-config 스킬로 아래 등록된 두 버전의 비교 JSON을 만들어줘.

프로젝트: [프로젝트 절대경로]
Harness Delta 위치: [빌드된 도구 checkout 경로 — 모르면 나에게 질문]
A — 현재 기준 하네스: [등록된 기준 버전 이름]
B — 수정한 하네스: [등록된 수정 버전 이름]
비교 ID: [새 비교 ID]
표시 이름: [비교 이름]
적용 방식: [snapshot / agent_applied — 모르면 나에게 질문]

대괄호가 남아 있거나 필요한 manifest·파일이 없거나 선택이 불명확하면 확인 가능한 manifest를 읽고, 생성 전에 빠진 입력을 나에게 선택·확인받아줘. ID를 추측하거나 A/B를 바꾸거나 하네스를 새로 만들거나 기존 비교를 덮어쓰지 마.
snapshot은 format 1, agent_applied는 format 2와 application=agent_applied를 사용해줘. agent_applied라면 두 하네스에 적용 절차가 있는지 확인해줘.
저장한 JSON을 검증한 뒤 실제 절대경로 한 줄만 코드블록으로 보여줘. UI에 붙여넣을 수 있게 하고, JSON 안의 참조는 상대경로로 유지해줘.
측정 설정·날짜·완료 기준·가격·실행 기본값은 임의로 만들지 마. 검토된 로컬 설정이 없으면 필요한 입력을 별도로 알려줘. 비교 파일 생성만으로 적용이나 측정을 시작하지 마.`) },
    { skill: null, icon: ClipboardPaste, title: t('Paste the file path', '경로 붙여넣기'),
      description: t('Paste the JSON path below.', 'JSON 경로를 아래에 붙여넣으세요.'), prompt: null },
  ];
  async function copyRequest(skill: string, prompt: string) {
    setCopying(skill);
    setCopied(null);
    setManualPrompt(null);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(skill);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setManualPrompt(prompt);
    } finally { setCopying(null); }
  }
  const change = () => { inputRevision.current++; setReview(null); setConfirmed(false); setInputError(false); };
  async function inspect() {
    setInputError(false);
    let input: Record<string, unknown>;
    try {
      input = { comparison_path: path, template_id: identifier };
      for (const [key, value] of Object.entries(documents)) {
        if (key === 'profile' && selectedTemplate) continue;
        if (value.trim()) input[key] = JSON.parse(value) as unknown;
      }
      if (freezeAt) input.freeze_at = freezeAt;
    } catch { setInputError(true); return; }
    setConfirmed(false);
    const revision = inputRevision.current;
    const result = await perform<SetupReviewResult>('/api/setup-review', input);
    if (inputRevision.current === revision) setReview(result);
  }
  return <Card data-guided-setup=""><CardHeader><CardTitle>{t('Guided setup and input review', '설정 안내와 입력 검토')}</CardTitle>
    <CardDescription>{t('Create a comparison with the skills, then paste its file path here.', '스킬로 비교 파일을 만든 뒤, 경로를 붙여넣으세요.')}</CardDescription></CardHeader>
    <CardContent className="space-y-5">
      <ol className="grid items-start gap-8 md:grid-cols-3" aria-label={t('Setup steps', '설정 순서')}>
        {skillSteps.map((step, index) => <li key={step.title} className="relative flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center gap-3"><step.icon className="size-5 shrink-0" aria-hidden="true" /><h3 className="font-medium">{index + 1}. {step.title}</h3></div>
          {step.skill && <code className="text-sm">{step.skill}</code>}
          <p className="flex-1 text-sm text-muted-foreground">{step.description}</p>
          {step.skill && step.prompt && <Button variant="outline" size="sm" disabled={copying !== null}
            data-copy-skill={step.skill} aria-label={`${step.skill} ${t('copy request', '요청문 복사')}`}
            onClick={() => { if (step.skill && step.prompt) void copyRequest(step.skill, step.prompt); }}>
            {copied === step.skill ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied === step.skill ? t('Copied', '복사됨') : t('Copy request', '요청문 복사')}
          </Button>}
          {step.prompt && <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">{t('View request and input fields', '요청문·입력칸 보기')}</summary>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 text-xs">{step.prompt}</pre>
          </details>}
          {index < skillSteps.length - 1 && <ArrowRight className="absolute -right-6 top-6 hidden size-4 text-muted-foreground md:block" aria-hidden="true" />}
        </li>)}
      </ol>
      <p className="text-sm text-muted-foreground">{t('Fill in the [bracketed fields] after copying, then paste into your agent. Leave unknown fields as they are: the request instructs the agent to ask before proceeding.', '복사한 요청문의 [입력칸]을 채워 에이전트에 붙여넣으세요. 모르는 항목은 그대로 두세요. 진행 전에 질문하도록 요청문에 명시했습니다.')}</p>
      {copied && <p role="status" className="text-sm">{t('Copied. Fill the [fields], or paste unchanged to ask for help with missing inputs.', '복사했습니다. [입력칸]을 채우거나 그대로 붙여넣어 필요한 입력을 질문받으세요.')}</p>}
      {manualPrompt && <div className="space-y-2"><p role="alert" className="text-sm">{t('Clipboard access failed. Select and copy the request below.', '복사하지 못했습니다. 아래 요청문을 직접 복사하세요.')}</p>
        <textarea aria-label={t('Request to copy manually', '직접 복사할 요청문')} readOnly rows={4} value={manualPrompt} onFocus={event => event.currentTarget.select()} className="w-full rounded border bg-background p-3 text-sm" /></div>}
      <div className="space-y-2"><Label htmlFor="guided-comparison">{t('Comparison JSON file path', '비교 JSON 파일 경로')}</Label>
        <Input id="guided-comparison" value={path} placeholder="/path/to/project/harness-config/comparisons/comparison.json" disabled={busy} onChange={event => { change(); setPath(event.target.value); }} /></div>
      <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">{t('What happens after importing?', '불러온 뒤에는 어떻게 하나요?')}</summary>
        <div className="mt-3 space-y-2 text-muted-foreground">
          <p>{t('Connect the Git project below. Select existing reviewed measurement settings, or provide missing inputs. Review and confirm before saving, then connect the private comparison settings.', '아래에서 Git 프로젝트를 연결하세요. 검토된 측정 설정을 선택하거나 빠진 입력을 제공한 뒤 확인하고 저장하세요. 이후 비공개 비교 설정을 연결합니다.')}</p>
          <p>{t('Setup does not start an agent or measurement. harness-apply and harness-connect are later steps with separate support requirements.', '설정만으로 에이전트나 측정이 시작되지는 않습니다. harness-apply와 harness-connect는 이후 단계이며 별도 지원 조건이 있습니다.')}</p>
        </div>
      </details>
      <div className="space-y-2"><Label htmlFor="guided-template">{t('Reuse registered measurement settings', '등록된 측정 설정 재사용')}</Label>
        <select id="guided-template" className="w-full rounded border bg-background p-2" disabled={busy} value={selectedTemplate?.id ?? ''} onChange={event => { change(); setTemplate(event.target.value); }}>
          <option value="">{t('Provide new measurement settings', '새 측정 설정 제공')}</option>
          {setups.filter(setup => !setup.shared).map(setup => <option key={setup.id} value={setup.id}>{setup.name} · {setup.id}</option>)}
        </select>
        <Label htmlFor="guided-template-id">{t('Measurement settings identifier', '측정 설정 식별자')}</Label>
        <Input id="guided-template-id" value={identifier} readOnly disabled={busy} aria-describedby="guided-identifier-help" />
        <p id="guided-identifier-help" role="status" className="break-keep text-sm text-muted-foreground">{selectedTemplate
          ? t('This is the selected registered setting’s identifier. Its existing profile is reused.', '선택한 등록 설정의 식별자입니다. 기존 profile을 재사용합니다.')
          : documents.profile?.trim() && !identifier.trim()
            ? t('A string id is required in profile JSON. Check the JSON format and id.', 'profile JSON에 문자열 id가 필요합니다. JSON 형식과 id를 확인하세요.')
            : t('Read automatically from profile JSON below. You do not need to enter it separately.', '아래 profile JSON의 id를 자동으로 읽습니다. 별도로 입력하지 않아도 됩니다.')}</p></div>
      <details><summary className="cursor-pointer font-medium">{t('Supply missing reviewed inputs (no defaults)', '빠진 검토 입력 제공 (기본값 없음)')}</summary>
        <p className="my-3 break-keep text-pretty text-sm">{t('Use the production JSON objects: one LocalWebProfile, an ordered array of schema-2 variants, one complete schema-2 protocol and one price table. For new settings, the identifier is read from profile.id. When reusing a registered setting, profile JSON is not used. Existing IDs may be reused; conflicting contents are rejected.', 'production JSON 객체를 사용하세요: LocalWebProfile 하나, schema-2 variant 배열, 완전한 schema-2 protocol 하나, 가격표 하나입니다. 신규 설정의 식별자는 profile.id에서 읽습니다. 등록된 설정을 재사용할 때는 profile JSON을 사용하지 않습니다. 기존 ID는 재사용할 수 있으나 내용 충돌은 거절합니다.')}</p>
        <p className="mb-3 text-sm">{t('Ask for criterion IDs, dates, sample plan, stopping/missingness rules, price references and runtime/source scope that are absent. Do not fabricate them. Snapshot hashes and policy versions come from the selected skill manifests.', '빠진 criterion ID·날짜·표본 계획·중단/누락 규칙·가격 참조·실행/원본 범위는 직접 확인하세요. 만들어 넣지 마세요. snapshot hash와 policy version은 선택한 skill manifest에서 가져옵니다.')}</p>
        <div className="space-y-4">{(['profile', 'variants', 'protocol', 'price_table'] as const).map(key => <div key={key} className="space-y-2">
          <Label htmlFor={`guided-${key}`}>{key} JSON</Label>
          <input type="file" accept=".json,application/json" disabled={busy || (key === 'profile' && !!selectedTemplate)} aria-label={`${key} JSON file`} onChange={event => {
            const file = event.target.files?.[0]; if (!file) return;
            change(); void file.text().then(value => { change(); setDocuments(old => ({ ...old, [key]: value })); });
          }} />
          <textarea id={`guided-${key}`} className="min-h-32 w-full rounded border bg-background p-3 font-mono text-xs" value={documents[key] ?? ''} disabled={busy || (key === 'profile' && !!selectedTemplate)} onChange={event => { change(); setDocuments(old => ({ ...old, [key]: event.target.value })); }} />
        </div>)}</div>
        <div className="mt-4 space-y-2"><Label htmlFor="guided-freeze">{t('Explicit freeze timestamp (only for an unfrozen protocol)', '명시적 동결 시각 (미동결 protocol에만 필요)')}</Label>
          <Input id="guided-freeze" value={freezeAt} disabled={busy} onChange={event => { change(); setFreezeAt(event.target.value); }} /></div>
      </details>
      <Button disabled={busy || !path.trim() || !identifier.trim()} onClick={() => { void inspect(); }}>{t('Review inputs without saving', '저장 없이 입력 검토')}</Button>
      {inputError && <p role="alert">{t('Invalid JSON. Correct the selected input; nothing was saved.', 'JSON이 올바르지 않습니다. 해당 입력을 수정하세요. 저장하지 않았습니다.')}</p>}
      {review && !review.ready && <div role="status" data-setup-review="blocked"><p>{t('Required inputs or registrations need attention. Supply the named JSON field or connect its project, then review again.', '필수 입력이나 등록을 확인하세요. 표시된 JSON 필드를 제공하거나 프로젝트를 연결한 뒤 다시 검토하세요.')}</p>
        <ul className="list-disc pl-5">{review.issues.map((issue, index) => <li key={index} className="break-all">{issue.field || 'input'}: {issue.code}</li>)}</ul></div>}
      {review?.ready && <div className="space-y-3 rounded-lg border p-4" data-setup-review="ready">
        <h3 className="font-medium">{t('Review before registration', '등록 전 검토')}</h3>
        <p>{t('Project', '프로젝트')}: {review.profile.setup.workflow.assignment.project_id}</p>
        <p>A: {review.protocol.variant_ids[0]} · B: {review.protocol.variant_ids[1]}</p>
        {review.preview.projects.map(project => <p key={project.project_id}>{project.name} · A: {project.pair.arm_a.version} · B: {project.pair.arm_b.version}</p>)}
        <p>{t('Criterion IDs', '완료 기준 ID')}: {review.profile.setup.workflow.assignment.metadata.criterion_ids.join(', ')}</p>
        <p>{t('Runtime (explicit null retains native choice)', '실행 설정 (명시적 null은 네이티브 선택 유지)')}: {JSON.stringify(review.profile.setup.runtime)}</p>
        <p>{t('Source scope', '원본 범위')}: {review.protocol.source_profiles.map(source => `${source.product} ${source.product_version} / ${source.profile_id}`).join(', ')}</p>
        <p>protocol: {review.protocol.id} · {review.protocol.purpose} · price_table: {review.price_table.id} / {review.price_table.version}</p>
        <details><summary>{t('Full frozen protocol, prices and private configuration', '동결 protocol·가격·비공개 구성 전체')}</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ registrations: review.registrations, protocol: review.protocol, price_table: review.price_table, profile: review.profile }, null, 2)}</pre></details>
        <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />{t('I reviewed these exact inputs and registrations. Save them without starting measurement.', '이 입력과 등록을 검토했습니다. 측정을 시작하지 않고 저장합니다.')}</label>
        <div className="flex gap-2"><Button disabled={busy || !confirmed} onClick={() => {
          void perform<SharedSetupImport>('/api/setup-save-reviewed', { token: review.token }).then(value => { if (value) { change(); onSaved(value); } });
        }}>{t('Save reviewed inputs', '검토한 입력 저장')}</Button><Button variant="outline" disabled={busy} onClick={change}>{t('Cancel review', '검토 취소')}</Button></div>
      </div>}
    </CardContent></Card>;
}
