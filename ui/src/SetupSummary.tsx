import type { Locale, Setup } from './types';
import { Badge } from '@/components/ui/badge';
import { SupportGuidance } from './SupportGuidance';

export function SetupSummary({ setup, projectName, locale }: {
  setup: Setup; projectName: string | undefined; locale: Locale;
}) {
  const t = (en: string, ko: string) => locale === 'ko' ? ko : en;
  return <article data-setup-id={setup.id} className="min-w-0 space-y-4 rounded-lg border p-4">
    <header className="space-y-1">
      <h3 className="break-words font-medium">{setup.name}</h3>
      <p className="break-all text-sm text-muted-foreground">{projectName ?? setup.project_id}</p>
    </header>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="min-w-0 rounded-md bg-muted/40 p-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">{t('Harness A', '하네스 A')}</p>
        <p className="break-all text-sm">{setup.arm_a}</p>
      </div>
      <div className="min-w-0 rounded-md bg-muted/40 p-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">{t('Harness B', '하네스 B')}</p>
        <p className="break-all text-sm">{setup.arm_b}</p>
      </div>
    </div>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="mb-1 text-muted-foreground">{t('Task types', '작업 유형')}</dt>
        <dd className="flex flex-wrap gap-1">{setup.types.length ? setup.types.map(type => <Badge key={type} variant="secondary">{type}</Badge>) : t('None', '없음')}</dd>
      </div>
      <div>
        <dt className="mb-1 text-muted-foreground">{t('Task sizes', '작업 크기')}</dt>
        <dd className="flex flex-wrap gap-1">{setup.sizes.length ? setup.sizes.map(size => <Badge key={size} variant="secondary">{size}</Badge>) : t('None', '없음')}</dd>
      </div>
      {setup.shared && <>
        <div><dt className="text-muted-foreground">{t('Model', '모델')}</dt><dd className="mt-1 break-all">{setup.shared.runtime.model ?? t('Native agent choice', '네이티브 에이전트 선택')}</dd></div>
        <div><dt className="text-muted-foreground">effort</dt><dd className="mt-1 break-all">{setup.shared.runtime.effort ?? t('Native agent choice', '네이티브 에이전트 선택')}</dd></div>
      </>}
    </dl>
    {setup.support_details && <SupportGuidance support={setup.support_details} locale={locale} compact />}
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">{t('Configuration IDs', '설정 식별자')}</summary>
      <dl className="mt-3 space-y-2">
        <div><dt className="text-muted-foreground">{t('Setup ID', '설정 ID')}</dt><dd className="break-all font-mono text-xs">{setup.id}</dd></div>
        <div><dt className="text-muted-foreground">{t('Project ID', '프로젝트 ID')}</dt><dd className="break-all font-mono text-xs">{setup.project_id}</dd></div>
        {setup.shared && <div><dt className="text-muted-foreground">template</dt><dd className="break-all">{setup.shared.template_name}<br /><code className="text-xs">{setup.shared.template_id}</code></dd></div>}
      </dl>
    </details>
  </article>;
}
