import { CircleAlert } from 'lucide-react';
import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';

const CONTROL =
  'w-full rounded-campo border border-cinza-contorno bg-branco px-3 text-corpo text-azul placeholder:text-cinza-texto aria-invalid:border-2 aria-invalid:border-erro';

interface FieldShellProps {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  children: ReactNode;
}

/** Label always visible above; the error sits next to the field, with an icon and text. */
function FieldShell({ id, label, error, hint, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-pequeno font-medium text-azul">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1 text-pequeno text-erro">
          <CircleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <div id={`${id}-hint`} className="text-legenda text-cinza-texto">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: ReactNode): string | undefined {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
}

export function TextField({ label, error, hint, id, className = '', ...rest }: TextFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint}>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={`${CONTROL} h-12 ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string | undefined;
  /** Current length, shown as a counter against `maxLength`. */
  length: number;
}

export function TextArea({ label, error, id, length, maxLength, ...rest }: TextAreaProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const counter = maxLength ? `${length}/${maxLength} caracteres` : undefined;
  return (
    <FieldShell id={fieldId} label={label} error={error} hint={counter}>
      <textarea
        id={fieldId}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, counter)}
        className={`${CONTROL} min-h-28 py-2`}
        {...rest}
      />
      {error && counter ? <p className="text-legenda text-cinza-texto">{counter}</p> : null}
    </FieldShell>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string | undefined;
}

export function SelectField({ label, error, id, children, ...rest }: SelectFieldProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldShell id={fieldId} label={label} error={error}>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error)}
        className={`${CONTROL} h-12`}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}
