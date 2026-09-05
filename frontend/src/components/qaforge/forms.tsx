"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { Icon } from "./icon";

// Ported from the imported design project's component bundle (components/ui/forms/**).
// Checkbox/RadioGroup/Select/Switch are backed by Base UI (already installed via components.json's
// shadcn scaffold) for real focus/keyboard/a11y behavior; everything renders through the same
// qf-* classes as the rest of the design system so screens don't need to change.

// ---------------------------------------------------------------------------
// Label, Field
// ---------------------------------------------------------------------------

export function Label({ required = false, className = "", children, ...rest }: { required?: boolean } & React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`qf-label ${required ? "qf-label--required" : ""} ${className}`.trim()} {...rest}>{children}</label>;
}

export function Field({ label, htmlFor, description, error, required = false, orientation = "vertical", className = "", children, ...rest }: {
  label?: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  orientation?: "vertical" | "horizontal";
} & React.HTMLAttributes<HTMLDivElement>) {
  const horizontal = orientation === "horizontal";
  return (
    <div className={`qf-field ${horizontal ? "qf-field--horizontal" : ""} ${className}`.trim()} {...rest}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        {label ? <Label htmlFor={htmlFor} required={required}>{label}</Label> : null}
        {horizontal && description ? <span className="qf-field__description">{description}</span> : null}
      </div>
      {children}
      {!horizontal && description && !error ? <span className="qf-field__description">{description}</span> : null}
      {error ? <span className="qf-field__error" role="alert"><Icon name="CircleAlert" size={12} />{error}</span> : null}
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

export function Input({ mono = false, size = "md", icon, invalid = false, className = "", ...rest }: InputProps) {
  const cls = ["qf-input", mono ? "qf-input--mono" : "", size === "sm" ? "qf-input--sm" : "", className].filter(Boolean).join(" ");
  const input = <input className={cls} aria-invalid={invalid || undefined} {...rest} />;
  if (!icon) return input;
  return <div className="qf-input-wrap"><Icon name={icon} size={14} />{input}</div>;
}

export function Textarea({ rows = 3, className = "", ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`qf-textarea ${className}`.trim()} rows={rows} {...rest} />;
}

// ---------------------------------------------------------------------------
// Select (Base UI) — native-select-shaped API: options + value/onValueChange
// ---------------------------------------------------------------------------

export type SelectOption = string | { value: string; label: string; disabled?: boolean };

export function Select({ options = [], value, defaultValue, onValueChange, placeholder, size = "md", disabled = false, className = "", id, style }: {
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
  const labelFor = (v: string | null) => opts.find((o) => o.value === v)?.label ?? v;
  return (
    <div className={`qf-select ${size === "sm" ? "qf-select--sm" : ""} ${className}`.trim()} style={style}>
      <SelectPrimitive.Root value={value ?? null} defaultValue={defaultValue} onValueChange={(v) => onValueChange?.(v as string)} disabled={disabled}>
        <SelectPrimitive.Trigger id={id} className="qf-select__trigger">
          <SelectPrimitive.Value placeholder={placeholder}>{(v: string | null) => labelFor(v)}</SelectPrimitive.Value>
          <SelectPrimitive.Icon className="qf-select__chevron"><Icon name="ChevronDown" size={14} /></SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Positioner sideOffset={4} className="qf-select__positioner">
            <SelectPrimitive.Popup className="qf-select__popup">
              {opts.map((o) => (
                <SelectPrimitive.Item key={o.value} value={o.value} disabled={o.disabled} className="qf-select__item">
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Popup>
          </SelectPrimitive.Positioner>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Combobox — searchable single-select. Hand-rolled (outside-click + filter),
// matching the source; Base UI's combobox targets a different (async) use case.
// ---------------------------------------------------------------------------

export interface ComboboxOption { value: string; label: string; hint?: string; icon?: string }

export function Combobox({ options = [], value, defaultValue, onValueChange, placeholder = "Select…", searchPlaceholder = "Search…", emptyText = "No results.", icon, disabled = false, className = "", style }: {
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
  const [query, setQuery] = React.useState("");
  const [internal, setInternal] = React.useState(defaultValue);
  const ref = React.useRef<HTMLDivElement>(null);
  const current = value !== undefined ? value : internal;
  const selected = options.find((o) => o.value === current);
  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));
  React.useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const choose = (v: string) => {
    if (value === undefined) setInternal(v);
    onValueChange?.(v);
    setOpen(false);
    setQuery("");
  };
  return (
    <div className={`qf-combobox ${className}`.trim()} ref={ref} style={style}>
      <button type="button" className="qf-combobox__trigger" aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
          {icon || selected?.icon ? <Icon name={selected?.icon || icon || ""} size={14} style={{ color: "var(--text-tertiary)" }} /> : null}
          {selected ? <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.label}</span> : <span className="qf-combobox__placeholder">{placeholder}</span>}
        </span>
        <Icon name="ChevronsUpDown" size={14} style={{ color: "var(--text-tertiary)" }} />
      </button>
      {open ? (
        <div className="qf-combobox__popover" role="listbox">
          <div className="qf-combobox__search">
            <Icon name="Search" size={14} />
            <input autoFocus value={query} placeholder={searchPlaceholder} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="qf-combobox__list">
            {filtered.length === 0 ? (
              <div className="qf-combobox__empty">{emptyText}</div>
            ) : (
              filtered.map((o) => (
                <div key={o.value} role="option" className="qf-combobox__item" aria-selected={o.value === current} onClick={() => choose(o.value)}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {o.icon ? <Icon name={o.icon} size={14} style={{ color: "var(--text-tertiary)" }} /> : null}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                    {o.hint ? <span className="qf-tertiary" style={{ fontSize: 12 }}>{o.hint}</span> : null}
                  </span>
                  {o.value === current ? <Icon name="Check" size={14} /> : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checkbox (Base UI)
// ---------------------------------------------------------------------------

export function Checkbox({ label, description, checked, defaultChecked = false, indeterminate = false, onCheckedChange, disabled = false, id, name, className = "" }: {
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
    <label className={`qf-checkbox ${disabled ? "qf-checkbox--disabled" : ""} ${className}`.trim()}>
      <CheckboxPrimitive.Root
        id={id}
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        indeterminate={indeterminate}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange?.(v)}
        className="qf-checkbox__box"
      >
        <CheckboxPrimitive.Indicator keepMounted={indeterminate}>
          <Icon name={indeterminate ? "Minus" : "Check"} size={12} strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label || description ? (
        <span className="qf-checkbox__text">
          {label ? <span>{label}</span> : null}
          {description ? <span className="qf-checkbox__description">{description}</span> : null}
        </span>
      ) : null}
    </label>
  );
}

// ---------------------------------------------------------------------------
// RadioGroup (Base UI)
// ---------------------------------------------------------------------------

export interface RadioOption { value: string; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }

export function RadioGroup({ options = [], value, defaultValue, onValueChange, name, orientation = "vertical", className = "" }: {
  options?: RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  orientation?: "vertical" | "horizontal";
  className?: string;
}) {
  return (
    <RadioGroupPrimitive
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(v) => onValueChange?.(v as string)}
      className={`qf-radio-group ${orientation === "horizontal" ? "qf-radio-group--horizontal" : ""} ${className}`.trim()}
    >
      {options.map((o) => (
        <label key={o.value} className="qf-radio" style={o.disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}>
          <RadioPrimitive.Root value={o.value} disabled={o.disabled} className="qf-radio__dot">
            <RadioPrimitive.Indicator />
          </RadioPrimitive.Root>
          <span className="qf-radio__text">
            <span>{o.label}</span>
            {o.description ? <span className="qf-radio__description">{o.description}</span> : null}
          </span>
        </label>
      ))}
    </RadioGroupPrimitive>
  );
}

// ---------------------------------------------------------------------------
// Switch (Base UI)
// ---------------------------------------------------------------------------

export function Switch({ checked, defaultChecked = false, onCheckedChange, disabled = false, size = "md", id, className = "" }: {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  id?: string;
  className?: string;
}) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      onCheckedChange={(v) => onCheckedChange?.(v)}
      className={`qf-switch ${size === "sm" ? "qf-switch--sm" : ""} ${className}`.trim()}
    >
      <SwitchPrimitive.Thumb className="qf-switch__thumb" />
    </SwitchPrimitive.Root>
  );
}
