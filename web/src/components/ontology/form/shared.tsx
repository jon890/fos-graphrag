import { type ReactNode } from 'react'
import type { OntologyDefinition, PropertyType } from '../../../api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export const PROPERTY_TYPES: PropertyType[] = ['string', 'text', 'url', 'enum', 'date', 'datetime', 'number', 'integer', 'boolean']
export const DEFAULT_COLOR = '#64748b'

/** 폼이 고치는 한 줄이 쓰는 도구 */
export interface FormContext {
  def: OntologyDefinition
  removed: string[]
  /** 뺄 예정을 적용한 정의. 타입이 빠져 시작과 끝이 비는지 보는 데 쓴다 */
  effective: OntologyDefinition
  /** 폼에서 고를 수 있는 노드 타입 키. Claim 은 없다 */
  typeKeys: string[]
  change: (def: OntologyDefinition) => void
  toggle: (path: string) => void
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1 text-xs text-muted-foreground', className)}>
      {label}
      {children}
    </label>
  )
}

export function FieldError({ message }: { message: string | null }) {
  return message ? (
    <p className="m-0 text-xs text-destructive" data-testid="ontology-form-error">
      {message}
    </p>
  ) : null
}

/** 빼기와 되살리기. 빠질 행은 흐려지고 배지가 붙는다 */
export function RemoveControl({ ctx, path, lockedReason }: { ctx: FormContext; path: string; lockedReason?: string | null }) {
  if (ctx.removed.includes(path)) {
    return (
      <span className="flex items-center gap-2">
        <Badge variant="outline">뺄 예정</Badge>
        <Button type="button" size="sm" variant="outline" data-testid="ontology-form-restore" onClick={() => ctx.toggle(path)}>
          되살리기
        </Button>
      </span>
    )
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      data-testid="ontology-form-remove"
      disabled={Boolean(lockedReason)}
      title={lockedReason ?? undefined}
      onClick={() => ctx.toggle(path)}
    >
      빼기
    </Button>
  )
}

export function TypeChecks({ ctx, selected, onChange, label }: { ctx: FormContext; selected: string[]; onChange: (types: string[]) => void; label: string }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="p-0 text-xs text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {ctx.typeKeys.map((type) => (
          <label key={type} className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(type)}
              onChange={(e) => onChange(e.target.checked ? [...selected, type] : selected.filter((t) => t !== type))}
            />
            {type}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** 키 입력칸과 그 아래 오류. 비어 있을 때는 오류를 보이지 않고 더하기만 막는다 */
export function KeyInput({ value, onChange, error, label }: { value: string; onChange: (v: string) => void; error: string | null; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Field label={label}>
        <Input data-testid="ontology-form-new-key" value={value} onChange={(e) => onChange(e.target.value.trim())} aria-invalid={Boolean(value && error)} />
      </Field>
      <FieldError message={value ? error : null} />
    </div>
  )
}

export function numberOrUndefined(text: string): number | undefined {
  const n = Number(text)
  return text.trim() === '' || Number.isNaN(n) ? undefined : n
}
