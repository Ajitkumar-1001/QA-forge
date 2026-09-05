"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Icon } from "./icon";
import { Label as ShadcnLabel } from "@/components/ui/label";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select as ShadcnSelect, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { RadioGroup as ShadcnRadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch as ShadcnSwitch } from "@/components/ui/switch";
import { cn } from "cn";

// Adapter layer: same exports/props as the original qf-* form primitives so screens don't change —
// internals now render real shadcn/ui (Base UI flavor) components instead of qf-* CSS classes, same
// convention as primitives.tsx. Checkbox/RadioGroup/Select/Switch already wrapped Base UI directly;
// the installed shadcn ui/checkbox.tsx, radio-group.tsx, select.tsx, switch.tsx wrap those same
// primitives with shadcn's styling.

// ---------------------------------------------------------------------------
// Label, Field
// ---------------------------------------------------------------------------

export function Label({ required = false, className, children, ...rest }: { required?: boolean } & React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <ShadcnLabel className={className} {...rest}>
      {children}
      {required ? <span className="text-destructive">*</span> : null}
    </ShadcnLabel>
  );
}

export function Field({ label, htmlFor, description, error, required = false, orientation = "vertical", className, children, ...rest }: {
  label?: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  orientation?: "vertical" | "horizontal";
} & React.HTMLAttributes<HTMLDivElement>) {
  const horizontal = orientation === "horizontal";
  return (
    <div className={cn("flex gap-4", horizontal ? "flex-row items-center justify-between" : "flex-col gap-1.5", className)} {...rest}>
      <div className="flex min-w-0 flex-col gap-0.5">
        {label ? <Label htmlFor={htmlFor} required={required}>{label}</Label> : null}
        {horizontal && description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </div>
      {children}
      {!horizontal && description && !error ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      {error ? <span className="flex items-center gap-1.5 text-xs text-destructive" role="alert"><Icon name="CircleAlert" size={12} />{error}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Input, Textarea
// ---------------------------------------------------------------------------

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  mono?: boolean;
  size?: "sm" | "md";
  icon?: string;
  invalid?: boolean;
}

export function Input({ mono = false, size = "md", icon, invalid = false, className, ...rest }: InputProps) {
  const sizeCls = size === "sm" ? "h-7 text-xs" : undefined;
  const input = <ShadcnInput className={cn(mono && "font-mono", sizeCls, !icon && className)} aria-invalid={invalid || undefined} {...rest} />;
  if (!icon) return input;
  return (
    <InputGroup className={cn(sizeCls, className)}>
      <InputGroupAddon><Icon name={icon} size={14} /></InputGroupAddon>
      <InputGroupInput className={cn(mono && "font-mono")} aria-invalid={invalid || undefined} {...rest} />
    </InputGroup>
  );
}

export function Textarea({ rows = 3, className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  // ponytail: shadcn's Textarea defaults to field-sizing-content (grows with input); the original
  // qf-textarea was a fixed-height, manually vertical-resizable box — keep that behavior.
  return <ShadcnTextarea className={cn("field-sizing-fixed resize-y", className)} rows={rows} {...rest} />;
}

// ---------------------------------------------------------------------------
// Select (Base UI) — native-select-shaped API: options + value/onValueChange
// ---------------------------------------------------------------------------

export type SelectOption = string | { value: string; label: string; disabled?: boolean };

export function Select({ options = [], value, defaultValue, onValueChange, placeholder, size = "md", disabled = false, className, id, style }: {
  options?: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <ShadcnSelect value={value ?? undefined} defaultValue={defaultValue} onValueChange={(v) => onValueChange?.(v as string)} disabled={disabled}>
      <SelectTrigger id={id} size={size === "sm" ? "sm" : "default"} className={cn("w-full", className)} style={style}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </ShadcnSelect>
  );
}

// ---------------------------------------------------------------------------
// Combobox — searchable single-select, composed from Popover + Command (cmdk owns filtering).
// ---------------------------------------------------------------------------

export interface ComboboxOption { value: string; label: string; hint?: string; icon?: string }

export function Combobox({ options = [], value, defaultValue, onValueChange, placeholder = "Select…", searchPlaceholder = "Search…", emptyText = "No results.", icon, disabled = false, className, style }: {
  options?: ComboboxOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  icon?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = React.useState(false);
  const [internal, setInternal] = React.useState(defaultValue);
  const current = value !== undefined ? value : internal;
  const selected = options.find((o) => o.value === current);
  const choose = (v: string) => {
    if (value === undefined) setInternal(v);
    onValueChange?.(v);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn("flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50", className)}
        style={style}
      >
        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
          {icon || selected?.icon ? <Icon name={selected?.icon || icon || ""} size={14} className="text-muted-foreground" /> : null}
          {selected ? <span className="truncate">{selected.label}</span> : <span className="text-muted-foreground">{placeholder}</span>}
        </span>
        <Icon name="ChevronsUpDown" size={14} className="shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {options.map((o) => (
              <CommandItem key={o.value} value={o.value} keywords={[o.label]} onSelect={() => choose(o.value)}>
                {o.icon ? <Icon name={o.icon} size={14} className="text-muted-foreground" /> : null}
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint ? <span className="text-xs text-muted-foreground">{o.hint}</span> : null}
                {o.value === current ? <Icon name="Check" size={14} /> : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Checkbox (Base UI) — composed directly from the primitive (not ui/checkbox.tsx): that file's
// indicator always shows a fixed check glyph with no data-indeterminate style, so it can't render
// the dash/indeterminate state used by e.g. "select all" checkboxes.
// ---------------------------------------------------------------------------

export function Checkbox({ label, description, checked, defaultChecked = false, indeterminate = false, onCheckedChange, disabled = false, id, name, className }: {
  label?: React.ReactNode;
  description?: React.ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
}) {
  return (
    <label className={cn("flex items-start gap-2", disabled && "opacity-50", className)}>
      <CheckboxPrimitive.Root
        id={id}
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        indeterminate={indeterminate}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange?.(v)}
        className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground"
      >
        <CheckboxPrimitive.Indicator keepMounted={indeterminate} className="grid place-content-center [&>svg]:size-3">
          <Icon name={indeterminate ? "Minus" : "Check"} size={12} strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label || description ? (
        <span className="flex flex-col gap-0.5 text-sm">
          {label ? <span>{label}</span> : null}
          {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
        </span>
      ) : null}
    </label>
  );
}

// ---------------------------------------------------------------------------
// RadioGroup (Base UI)
// ---------------------------------------------------------------------------

export interface RadioOption { value: string; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }

export function RadioGroup({ options = [], value, defaultValue, onValueChange, name, orientation = "vertical", className }: {
  options?: RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  orientation?: "vertical" | "horizontal";
  className?: string;
}) {
  return (
    <ShadcnRadioGroup
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(v) => onValueChange?.(v as string)}
      className={cn(orientation === "horizontal" ? "flex flex-row flex-wrap gap-5" : "flex flex-col gap-2.5", className)}
    >
      {options.map((o) => (
        <label key={o.value} className={cn("flex items-start gap-2", o.disabled && "cursor-not-allowed opacity-50")}>
          <RadioGroupItem value={o.value} disabled={o.disabled} className="mt-0.5" />
          <span className="flex flex-col gap-0.5 text-sm">
            <span>{o.label}</span>
            {o.description ? <span className="text-xs text-muted-foreground">{o.description}</span> : null}
          </span>
        </label>
      ))}
    </ShadcnRadioGroup>
  );
}

// ---------------------------------------------------------------------------
// Switch (Base UI)
// ---------------------------------------------------------------------------

export function Switch({ checked, defaultChecked = false, onCheckedChange, disabled = false, size = "md", id, className }: {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  id?: string;
  className?: string;
}) {
  return (
    <ShadcnSwitch
      id={id}
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      onCheckedChange={(v) => onCheckedChange?.(v)}
      size={size === "sm" ? "sm" : "default"}
      className={className}
    />
  );
}
