"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { Icon } from "./icon";
import { Button, Kbd } from "./primitives";

// Ported from the imported design project's component bundle (components/ui/overlays/**).
// Dialog/AlertDialog/Sheet and Tabs are backed by Base UI for real focus trap / scroll lock /
// escape handling; MenuList/DropdownMenu/Command/Toast are hand-rolled (matching the source
// closely) since the used screens don't need a floating-ui-grade menu.

// ---------------------------------------------------------------------------
// Dialog, AlertDialog (Base UI)
// ---------------------------------------------------------------------------

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  showClose?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function Dialog({ open = false, onOpenChange, title, description, footer, size = "md", showClose = true, className = "", children }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => onOpenChange?.(v)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="qf-overlay" />
        <DialogPrimitive.Popup
          className={`qf-dialog ${size === "lg" ? "qf-dialog--lg" : size === "sm" ? "qf-dialog--sm" : ""} ${className}`.trim()}
          aria-label={typeof title === "string" ? title : undefined}
        >
          {title || description ? (
            <div className="qf-dialog__header">
              {title ? <DialogPrimitive.Title className="qf-dialog__title">{title}</DialogPrimitive.Title> : null}
              {description ? <DialogPrimitive.Description className="qf-dialog__description">{description}</DialogPrimitive.Description> : null}
            </div>
          ) : null}
          {showClose ? (
            <DialogPrimitive.Close className="qf-btn qf-btn--ghost qf-btn--icon qf-btn--sm qf-dialog__close" aria-label="Close">
              <Icon name="X" size={14} />
            </DialogPrimitive.Close>
          ) : null}
          {children !== undefined ? <div className="qf-dialog__body">{children}</div> : null}
          {footer ? <div className="qf-dialog__footer">{footer}</div> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export interface AlertDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  tone?: "default" | "warning" | "destructive";
  loading?: boolean;
  children?: React.ReactNode;
}

/** Confirmation dialog for consequential actions (design.md §31). No close-X; must Cancel or confirm. */
export function AlertDialog({ open = false, onOpenChange, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel, tone = "default", loading = false, children }: AlertDialogProps) {
  const icon = tone === "destructive" ? "TriangleAlert" : tone === "warning" ? "ShieldAlert" : null;
  const cancel = () => { onCancel?.(); onOpenChange?.(false); };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      showClose={false}
      size="sm"
      className={`qf-alert-dialog ${tone !== "default" ? `qf-alert-dialog--${tone}` : ""}`.trim()}
      title={<>{icon ? <Icon name={icon} size={16} /> : null}{title}</>}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={cancel}>{cancelLabel}</Button>
          <Button variant={tone === "destructive" ? "destructive" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sheet (Base UI Dialog, styled as a side panel)
// ---------------------------------------------------------------------------

export function Sheet({ open = false, onOpenChange, side = "right", title, description, footer, width, className = "", children }: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "left" | "right";
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number | string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => onOpenChange?.(v)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="qf-overlay" />
        <DialogPrimitive.Popup className={`qf-sheet ${side === "left" ? "qf-sheet--left" : ""} ${className}`.trim()} style={width ? { width } : undefined}>
          <div className="qf-sheet__header">
            <div>
              {title ? <DialogPrimitive.Title className="qf-sheet__title">{title}</DialogPrimitive.Title> : null}
              {description ? <DialogPrimitive.Description className="qf-sheet__description">{description}</DialogPrimitive.Description> : null}
            </div>
            <DialogPrimitive.Close className="qf-btn qf-btn--ghost qf-btn--icon qf-btn--sm" aria-label="Close">
              <Icon name="X" size={14} />
            </DialogPrimitive.Close>
          </div>
          <div className="qf-sheet__body">{children}</div>
          {footer ? <div className="qf-sheet__footer">{footer}</div> : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// MenuList / DropdownMenu — hand-rolled (outside-click + escape), matching the source
// ---------------------------------------------------------------------------

export interface MenuItemDef {
  type?: "separator" | "label";
  label?: React.ReactNode;
  icon?: string;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  checked?: boolean;
}

export function MenuList({ items = [], onSelect, floating = false, style, className = "" }: {
  items?: MenuItemDef[];
  onSelect?: (item: MenuItemDef) => void;
  floating?: boolean;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div role="menu" className={`qf-menu ${floating ? "qf-menu--floating" : ""} ${className}`.trim()} style={style}>
      {items.map((it, i) => {
        if (it.type === "separator") return <div key={i} className="qf-menu__separator" role="separator" />;
        if (it.type === "label") return <div key={i} className="qf-menu__label">{it.label}</div>;
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`qf-menu__item ${it.destructive ? "qf-menu__item--destructive" : ""}`.trim()}
            disabled={it.disabled}
            onClick={() => { it.onSelect?.(); onSelect?.(it); }}
          >
            {it.checked !== undefined ? <span className="qf-menu__check">{it.checked ? <Icon name="Check" size={14} /> : null}</span> : it.icon ? <Icon name={it.icon} size={14} /> : null}
            <span className="qf-menu__item-label">{it.label}</span>
            {it.shortcut ? <span className="qf-menu__shortcut">{it.shortcut}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function DropdownMenu({ trigger, items = [], align = "start", onSelect, open, onOpenChange, className = "" }: {
  trigger: React.ReactNode;
  items?: MenuItemDef[];
  align?: "start" | "end";
  onSelect?: (item: MenuItemDef) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [internal, setInternal] = React.useState(false);
  const isOpen = open !== undefined ? open : internal;
  const ref = React.useRef<HTMLSpanElement>(null);
  const set = (v: boolean) => { if (open === undefined) setInternal(v); onOpenChange?.(v); };
  React.useEffect(() => {
    if (!isOpen) return undefined;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) set(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") set(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  return (
    <span className={`qf-dropdown ${align === "end" ? "qf-dropdown--end" : ""} ${className}`.trim()} ref={ref}>
      <span onClick={() => set(!isOpen)} style={{ display: "inline-flex" }} aria-haspopup="menu" aria-expanded={isOpen}>{trigger}</span>
      {isOpen ? <MenuList items={items} onSelect={(it) => { onSelect?.(it); set(false); }} /> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Command palette (⌘K)
// ---------------------------------------------------------------------------

export interface CommandGroup { heading?: string; items: { id: string; label: string; icon?: string; hint?: string; shortcut?: string[]; onSelect?: () => void }[] }

export function Command({ groups = [], placeholder = "Type a command or search…", emptyText = "No results found.", onSelect, open = true, onOpenChange, asDialog = false, autoFocus = true, className = "" }: {
  groups?: CommandGroup[];
  placeholder?: string;
  emptyText?: string;
  onSelect?: (item: CommandGroup["items"][number]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  asDialog?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const q = query.trim().toLowerCase();
  const visible = groups.map((g) => ({ ...g, items: g.items.filter((it) => !q || it.label.toLowerCase().includes(q) || (it.hint || "").toLowerCase().includes(q)) })).filter((g) => g.items.length);
  const flat = visible.flatMap((g) => g.items);
  // Reset the highlighted item when the query changes — adjusted during render (React's
  // recommended pattern) instead of a setState-in-effect, which the lint rule flags.
  const [prevQuery, setPrevQuery] = React.useState(q);
  if (q !== prevQuery) { setPrevQuery(q); setActive(0); }
  React.useEffect(() => {
    if (!asDialog || !open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange?.(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [asDialog, open, onOpenChange]);
  if (!open) return null;
  const choose = (it: CommandGroup["items"][number]) => { it.onSelect?.(); onSelect?.(it); onOpenChange?.(false); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && flat[active]) { e.preventDefault(); choose(flat[active]); }
  };
  const panel = (
    <div className={`qf-command ${className}`.trim()} onKeyDown={onKeyDown}>
      <div className="qf-command__input">
        <Icon name="Search" size={16} />
        <input autoFocus={autoFocus} value={query} placeholder={placeholder} onChange={(e) => setQuery(e.target.value)} aria-label="Command search" />
        <Kbd>esc</Kbd>
      </div>
      <div className="qf-command__list" role="listbox">
        {flat.length === 0 ? (
          <div className="qf-command__empty">{emptyText}</div>
        ) : (
          visible.map((g) => (
            <div key={g.heading} className="qf-command__group">
              {g.heading ? <div className="qf-command__heading">{g.heading}</div> : null}
              {g.items.map((it) => {
                const idx = flat.indexOf(it);
                return (
                  <div key={it.id || it.label} role="option" aria-selected={idx === active} data-active={idx === active || undefined} className="qf-command__item" onMouseEnter={() => setActive(idx)} onClick={() => choose(it)}>
                    {it.icon ? <Icon name={it.icon} size={16} /> : null}
                    <span className="qf-command__item-label">{it.label}</span>
                    {it.hint ? <span className="qf-command__hint">{it.hint}</span> : null}
                    {it.shortcut ? <Kbd keys={it.shortcut} /> : null}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
      <div className="qf-command__footer">
        <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
        <span><Kbd>↵</Kbd> select</span>
        <span><Kbd>esc</Kbd> close</span>
      </div>
    </div>
  );
  if (!asDialog) return panel;
  return (
    <>
      <div className="qf-overlay" onClick={() => onOpenChange?.(false)} />
      <div className="qf-command-dialog" role="dialog" aria-modal="true">{panel}</div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Toast, ToastRegion
// ---------------------------------------------------------------------------

export interface ToastDef {
  id: string | number;
  title?: React.ReactNode;
  description?: React.ReactNode;
  tone?: "default" | "success" | "error" | "warning";
  icon?: string;
  action?: string;
  onAction?: () => void;
}

export function Toast({ title, description, tone = "default", icon, action, onAction, onDismiss, className = "" }: ToastDef & { onDismiss?: () => void; className?: string }) {
  const glyph = icon || (tone === "success" ? "CircleCheck" : tone === "error" ? "CircleX" : tone === "warning" ? "TriangleAlert" : "Info");
  return (
    <div role="status" className={`qf-toast ${tone !== "default" ? `qf-toast--${tone}` : ""} ${className}`.trim()}>
      <span className="qf-toast__icon"><Icon name={glyph} size={16} /></span>
      <div className="qf-toast__body">
        {title ? <div className="qf-toast__title">{title}</div> : null}
        {description ? <div className="qf-toast__description">{description}</div> : null}
      </div>
      {action ? <span className="qf-toast__action"><Button size="sm" variant="outline" onClick={onAction}>{action}</Button></span> : null}
      {onDismiss ? <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={onDismiss}><Icon name="X" size={14} /></Button> : null}
    </div>
  );
}

export function ToastRegion({ toasts = [], onDismiss, className = "" }: { toasts?: ToastDef[]; onDismiss?: (id: string | number) => void; className?: string }) {
  return (
    <div className={`qf-toast-region ${className}`.trim()} aria-live="polite">
      {toasts.map((t) => <Toast key={t.id} {...t} onDismiss={onDismiss ? () => onDismiss(t.id) : undefined} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs (Base UI)
// ---------------------------------------------------------------------------

export interface TabItem { value: string; label: React.ReactNode; icon?: string; count?: number; content?: React.ReactNode; disabled?: boolean }

export function Tabs({ items = [], value, defaultValue, onValueChange, variant = "underline", className = "", children }: {
  items?: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  variant?: "underline" | "enclosed";
  className?: string;
  children?: React.ReactNode;
}) {
  const initial = defaultValue !== undefined ? defaultValue : items[0]?.value;
  return (
    <TabsPrimitive.Root
      value={value}
      defaultValue={initial}
      onValueChange={(v) => onValueChange?.(v as string)}
      className={`qf-tabs ${variant === "enclosed" ? "qf-tabs--enclosed" : ""} ${className}`.trim()}
    >
      <TabsPrimitive.List className="qf-tabs__list">
        {items.map((it) => (
          <TabsPrimitive.Tab key={it.value} value={it.value} disabled={it.disabled} className="qf-tabs__trigger">
            {it.icon ? <Icon name={it.icon} size={14} /> : null}
            {it.label}
            {it.count !== undefined ? <span className="qf-tabs__count">{it.count}</span> : null}
          </TabsPrimitive.Tab>
        ))}
      </TabsPrimitive.List>
      {items.some((it) => it.content !== undefined) ? (
        items.map((it) => (
          <TabsPrimitive.Panel key={it.value} value={it.value} className="qf-tabs__content">{it.content}</TabsPrimitive.Panel>
        ))
      ) : children ? (
        <TabsPrimitive.Panel value={initial ?? ""} className="qf-tabs__content">{children}</TabsPrimitive.Panel>
      ) : null}
    </TabsPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Resizable — two-panel drag split (no Base UI equivalent; ported plainly)
// ---------------------------------------------------------------------------

export function Resizable({ direction = "horizontal", defaultSize = 60, minSize = 20, maxSize = 80, first, second, onResize, showGrip = true, className = "", style }: {
  direction?: "horizontal" | "vertical";
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  first?: React.ReactNode;
  second?: React.ReactNode;
  onResize?: (size: number) => void;
  showGrip?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [size, setSize] = React.useState(defaultSize);
  const [dragging, setDragging] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const horizontal = direction === "horizontal";
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const rect = ref.current!.getBoundingClientRect();
      const pos = horizontal ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height;
      const next = Math.max(minSize, Math.min(maxSize, pos * 100));
      setSize(next);
      onResize?.(next);
    };
    const up = () => { setDragging(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div ref={ref} className={`qf-resizable ${horizontal ? "" : "qf-resizable--vertical"} ${className}`.trim()} style={style}>
      <div className="qf-resizable__panel" style={{ flex: `0 0 calc(${size}% - 0.5px)` }}>{first}</div>
      <div className="qf-resizable__handle" role="separator" aria-orientation={horizontal ? "vertical" : "horizontal"} data-dragging={dragging || undefined} onPointerDown={onDown}>
        {showGrip ? <span className="qf-resizable__grip"><Icon name={horizontal ? "GripVertical" : "GripHorizontal"} size={10} /></span> : null}
      </div>
      <div className="qf-resizable__panel" style={{ flex: "1 1 0%" }}>{second}</div>
    </div>
  );
}
