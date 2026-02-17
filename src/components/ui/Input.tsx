import React, { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef, useId } from 'react';
import clsx from 'clsx';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className, id, required, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    const describedBy = [
      error ? errorId : null,
      helperText && !error ? helperId : null,
    ].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-semibold text-foreground mb-1.5">
            {label}
            {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={clsx(
              'w-full rounded-xl border transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
              'disabled:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground',
              'placeholder:text-muted-foreground/60',
              'bg-card text-foreground',
              error
                ? 'border-red-400 focus:ring-red-500/20 focus:border-red-500'
                : 'border-input hover:border-input/80',
              leftIcon ? 'pl-10' : 'pl-4',
              rightIcon ? 'pr-10' : 'pr-4',
              'py-2.5 text-sm',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-muted-foreground">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p id={errorId} className="mt-1.5 text-sm text-red-500 flex items-center gap-1" role="alert">{error}</p>}
        {helperText && !error && <p id={helperId} className="mt-1.5 text-sm text-muted-foreground">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className, id, required, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id || generatedId;
    const errorId = `${textareaId}-error`;
    const helperId = `${textareaId}-helper`;

    const describedBy = [
      error ? errorId : null,
      helperText && !error ? helperId : null,
    ].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-semibold text-foreground mb-1.5">
            {label}
            {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={clsx(
            'w-full rounded-xl border px-4 py-2.5 text-sm transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
            'disabled:bg-muted disabled:cursor-not-allowed',
            'placeholder:text-muted-foreground/60',
            'bg-card text-foreground',
            'resize-none',
            error
              ? 'border-red-400 focus:ring-red-500/20 focus:border-red-500'
              : 'border-input hover:border-input/80',
            className
          )}
          {...props}
        />
        {error && <p id={errorId} className="mt-1.5 text-sm text-red-500" role="alert">{error}</p>}
        {helperText && !error && <p id={helperId} className="mt-1.5 text-sm text-muted-foreground">{helperText}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string | number; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, placeholder, className, id, required, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-semibold text-foreground mb-1.5">
            {label}
            {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={clsx(
              'w-full rounded-xl border px-4 py-2.5 pr-10 text-sm transition-all duration-200 cursor-pointer',
              'focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring',
              'disabled:bg-muted disabled:cursor-not-allowed',
              'appearance-none bg-card text-foreground',
              error ? 'border-red-400' : 'border-input hover:border-input/80',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {/* Custom dropdown arrow */}
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-muted-foreground">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {error && <p id={errorId} className="mt-1.5 text-sm text-red-500" role="alert">{error}</p>}
        {helperText && !error && <p className="mt-1.5 text-sm text-muted-foreground">{helperText}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const generatedId = useId();
    const checkboxId = id || generatedId;

    return (
      <div className="flex items-start">
        <div className="flex items-center h-5">
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            className={clsx(
              'w-4 h-4 rounded border-border text-primary cursor-pointer',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              className
            )}
            {...props}
          />
        </div>
        <div className="ml-3">
          <label htmlFor={checkboxId} className="text-sm text-foreground cursor-pointer select-none">
            {label}
          </label>
          {error && <p className="text-sm text-red-500 mt-0.5" role="alert">{error}</p>}
        </div>
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
