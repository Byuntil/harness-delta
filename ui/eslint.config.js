import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { plugin as shadcn } from '@shadcn/lint';
export default tseslint.config(
 { ignores: ['node_modules/**','../dist/**'] }, js.configs.recommended, ...tseslint.configs.recommended,
 { files: ['**/*.{ts,tsx}'], languageOptions: { globals: { window:'readonly',document:'readonly',localStorage:'readonly',location:'readonly',navigator:'readonly',fetch:'readonly',crypto:'readonly',AbortSignal:'readonly',Response:'readonly',setInterval:'readonly',clearInterval:'readonly' } },
   plugins:{shadcn}, settings:{shadcn:{ui:'@/components/ui',note:'Use the semantic theme and component variants; show actionable blockers outside details.'}},
   rules:{'shadcn/no-arbitrary-values':'error','shadcn/no-raw-colors':'error','shadcn/no-inline-styles':'error','shadcn/no-restyle':['error',{allow:['layout'],contracts:[{pattern:'^CardContent$',allow:['layout','spacing']},{pattern:'^TooltipContent$',allow:['layout']}]}], '@typescript-eslint/no-explicit-any':'error'} },
 { files: ['src/components/ui/**'], rules: {'shadcn/no-arbitrary-values':'off','shadcn/no-raw-colors':'off','shadcn/no-restyle':'off','shadcn/no-inline-styles':'off'} }
);
