'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface Option<T extends string> {
  value: T;
  label: string;
}

interface OptionSelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: Option<T>[];
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}

/** Single-value select with labelled options; the trigger shows the label, not the raw value. */
export function OptionSelect<T extends string>({
  value,
  onValueChange,
  options,
  id,
  className,
  ...aria
}: OptionSelectProps<T>) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next as T);
      }}
    >
      <SelectTrigger id={id} className={cn('w-full data-[size=default]:h-11 md:data-[size=default]:h-9', className)} {...aria}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="min-h-10 md:min-h-8">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
