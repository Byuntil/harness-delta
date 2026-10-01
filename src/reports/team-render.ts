import type { TeamReport,InvalidatedTeamReport } from './team-snapshot.js';
/** Markdown embeds the canonical report values without inventing another calculation. */
export function renderTeamReport(report:TeamReport|InvalidatedTeamReport,format:string):string {
  if(format==='json')return JSON.stringify(report,null,2)+'\n';
  if(format==='markdown')return '# Synthetic team comparison report\n\n'+(report.validity_status==='valid'?
    'Team completeness: unverified. Declared writer coverage: '+report.declared_writer_coverage+'. Partial observations are not complete task totals. Adoption remains inconclusive.\n\n':
    'This original cohort is unavailable after invalidation.\n\n')+'```json\n'+JSON.stringify(report,null,2)+'\n```\n';
  throw new Error('invalid_format');
}
