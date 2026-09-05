"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Icon } from "./icon";
import { Button, Kbd } from "./primitives";
import { cn } from "cn";

import {
  Dialog as ShadcnDialog,
  DialogPortal,
  DialogOverlay,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet as ShadcnSheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs as ShadcnTabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu as ShadcnDropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import {
  Command as ShadcnCommand,
  CommandDialog,
  CommandEmpty,
  CommandGroup as ShadcnCommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

// Adapter layer (see primitives.tsx for the established pattern): same exports/props as the
// original qf-* overlays so screens don't change — internals now render real shadcn/ui (Base UI
// / cmdk flavor) components instead of qf-* CSS classes. Dialog/Sheet/Tabs compose shadcn's
// dialog.tsx/sheet.tsx/tabs.tsx building blocks (with a couple of exact-token colors — the modal
// scrim, the sheet's darker surface — pulled in via arbitrary-value `var(--…)` since no Tailwind
// utility exposes them); DropdownMenu/Command adapt their old flat data-driven APIs onto shadcn's
// compound dropdown-menu.tsx/command.tsx structure; Toast/Resizable stay hand-rolled per the
// migration brief, restyled with Tailwind utilities matching their qf-* look.
//
// Overrides below that fight a shadcn default gated behind an attribute variant (e.g.
// `data-[side=right]:`, `group-data-horizontal/tabs:`) repeat that exact prefix themselves —
// `cn` (tailwind-merge) only dedupes same-prefix utilities; an unprefixed override loses the
// cascade to a prefixed default even when it appears later in the class list.

// ---------------------------------------------------------------------------
// Dialog, AlertDialog (shadcn dialog.tsx building blocks + Base UI Popup/Close)
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
    <ShadcnDialog open={open} onOpenChange={(v) => onOpenChange?.(v)}>
      <DialogPortal>
        <DialogOverlay className="bg-[var(--scrim)]" />
        <DialogPrimitive.Popup
          aria-label={typeof title === "string" ? title : undefined}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100%-32px)] w-[min(480px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-2xl ring-1 ring-border outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            size === "lg" && "w-[min(720px,calc(100%-32px))]",
            size === "sm" && "w-[min(400px,calc(100%-32px))]",
            className,
          )}
        >
          {title || description ? (
            <DialogHeader className="gap-1 px-5 pt-5 pb-0">
              {title ? <DialogTitle className="flex items-center gap-2">{title}</DialogTitle> : null}
              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </DialogHeader>
          ) : null}
          {showClose ? (
            <DialogPrimitive.Close render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" />} aria-label="Close">
              <Icon name="X" size={14} />
            </DialogPrimitive.Close>
          ) : null}
          {children !== undefined ? <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-5 py-4 text-sm">{children}</div> : null}
          {footer ? <DialogFooter className="mx-0 mb-0 justify-end gap-2 rounded-b-lg border-t border-border bg-card px-5 py-3">{footer}</DialogFooter> : null}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </ShadcnDialog>
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
  const iconTone = tone === "destructive" ? "text-status-error" : tone === "warning" ? "text-status-warning" : undefined;
  const cancel = () => { onCancel?.(); onOpenChange?.(false); };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      showClose={false}
      size="sm"
      title={<>{icon ? <Icon name={icon} size={16} className={iconTone} /> : null}{title}</>}
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
// Sheet (shadcn sheet.tsx)
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
    <ShadcnSheet open={open} onOpenChange={(v) => onOpenChange?.(v)}>
      <SheetContent
        side={side}
        className={cn(
          "gap-0 border-border bg-[var(--surface-1)] p-0",
          // SheetContent's own default width is `data-[side=…]:sm:max-w-sm` — an unprefixed
          // override loses that cascade (higher-specificity attribute selector), so match it.
          width
            ? "data-[side=left]:sm:max-w-none data-[side=right]:sm:max-w-none"
            : "data-[side=left]:sm:max-w-[420px] data-[side=right]:sm:max-w-[420px]",
          className,
        )}
        style={width ? { width } : undefined}
      >
        {title || description ? (
          <SheetHeader className="flex-row items-start justify-between gap-3 border-b border-border p-4 pr-11">
            <div className="flex flex-col gap-0.5">
              {title ? <SheetTitle>{title}</SheetTitle> : null}
              {description ? <SheetDescription>{description}</SheetDescription> : null}
            </div>
          </SheetHeader>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 text-sm">{children}</div>
        {footer ? <SheetFooter className="flex-row justify-end border-t border-border p-3">{footer}</SheetFooter> : null}
      </SheetContent>
    </ShadcnSheet>
  );
}

// ---------------------------------------------------------------------------
// MenuList — hand-rolled static list, restyled with Tailwind
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

// ponytail: MenuList has no trigger/positioning of its own and no call site in the app (grep
// confirms) — DropdownMenu below is now backed by shadcn's real Menu-based dropdown-menu.tsx
// instead of composing this. Base UI's Menu.Item only works inside a Menu.Root/Popup, so a
// standalone always-visible list stays a plain styled list rather than borrowing those parts.
export function MenuList({ items = [], onSelect, floating = false, style, className = "" }: {
  items?: MenuItemDef[];
  onSelect?: (item: MenuItemDef) => void;
  floating?: boolean;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div role="menu" className={cn("min-w-[200px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md", floating && "absolute", className)} style={style}>
      {items.map((it, i) => {
        if (it.type === "separator") return <div key={i} role="separator" className="-mx-1 my-1 h-px bg-border" />;
        if (it.type === "label") return <div key={i} className="px-1.5 py-1 text-xs font-medium text-muted-foreground">{it.label}</div>;
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            className={cn(
              "flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50",
              it.destructive && "text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10",
            )}
            onClick={() => { it.onSelect?.(); onSelect?.(it); }}
          >
            {it.checked !== undefined ? <span className="flex w-3.5 shrink-0 justify-center">{it.checked ? <Icon name="Check" size={14} /> : null}</span> : it.icon ? <Icon name={it.icon} size={14} className="text-muted-foreground" /> : null}
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.shortcut ? <span className="text-xs text-muted-foreground">{it.shortcut}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DropdownMenu (shadcn dropdown-menu.tsx — Base UI Menu)
// ---------------------------------------------------------------------------

export function DropdownMenu({ trigger, items = [], align = "start", onSelect, open, onOpenChange, className = "" }: {
  trigger: React.ReactNode;
  items?: MenuItemDef[];
  align?: "start" | "end";
  onSelect?: (item: MenuItemDef) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  return (
    <ShadcnDropdownMenu open={open} onOpenChange={(v) => onOpenChange?.(v)}>
      {/* The trigger is always a single interactive element (a Button, per every call site) —
          Base UI's render prop clones it and merges in the menu's own handlers/aria/ref. */}
      <DropdownMenuTrigger render={trigger as React.ReactElement} />
      {/* Every trigger here is a small icon button, so the default anchor-width popup (floored
          to min-w-32 = 128px) truncates longer labels — qf-menu was min-width:200px, unbounded. */}
      <DropdownMenuContent align={align} className={cn("w-auto min-w-[200px]", className)}>
        {items.map((it, i) => {
          if (it.type === "separator") return <DropdownMenuSeparator key={i} />;
          if (it.type === "label") return <DropdownMenuLabel key={i}>{it.label}</DropdownMenuLabel>;
          return (
            <DropdownMenuItem
              key={i}
              variant={it.destructive ? "destructive" : "default"}
              disabled={it.disabled}
              onClick={() => { it.onSelect?.(); onSelect?.(it); }}
            >
              {it.checked !== undefined ? <span className="flex w-3.5 shrink-0 justify-center">{it.checked ? <Icon name="Check" size={14} /> : null}</span> : it.icon ? <Icon name={it.icon} size={14} /> : null}
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.shortcut ? <DropdownMenuShortcut>{it.shortcut}</DropdownMenuShortcut> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </ShadcnDropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Command palette (⌘K) — shadcn command.tsx (cmdk)
// ---------------------------------------------------------------------------

export interface CommandGroup { heading?: string; items: { id: string; label: string; icon?: string; hint?: string; shortcut?: string[]; onSelect?: () => void }[] }

// ponytail: cmdk (shadcn's Command) owns search filtering and keyboard nav (↑/↓/Enter) itself —
// the hand-rolled query/active state and keydown handler this used to need are gone. In dialog
// mode, closing is now left to Base UI's Dialog (which unmounts after its own exit animation)
// instead of an immediate `if (!open) return null`.
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
  const choose = (it: CommandGroup["items"][number]) => { it.onSelect?.(); onSelect?.(it); onOpenChange?.(false); };
  const content = (
    <>
      <CommandInput placeholder={placeholder} autoFocus={autoFocus} />
      <CommandList>
        <CommandEmpty>{emptyText}</CommandEmpty>
        {groups.map((g, gi) => (
          <ShadcnCommandGroup key={g.heading ?? gi} heading={g.heading}>
            {g.items.map((it) => (
              <CommandItem key={it.id || it.label} value={[it.label, it.hint].filter(Boolean).join(" ")} onSelect={() => choose(it)}>
                {it.icon ? <Icon name={it.icon} size={16} className="text-muted-foreground" /> : null}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint ? <span className="shrink-0 text-xs text-muted-foreground">{it.hint}</span> : null}
                {it.shortcut ? <CommandShortcut><Kbd keys={it.shortcut} /></CommandShortcut> : null}
              </CommandItem>
            ))}
          </ShadcnCommandGroup>
        ))}
      </CommandList>
      <div className="flex items-center gap-3.5 border-t border-border px-3.5 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
        <span className="inline-flex items-center gap-1.5"><Kbd>↵</Kbd> select</span>
        <span className="inline-flex items-center gap-1.5"><Kbd>esc</Kbd> close</span>
      </div>
    </>
  );
  if (asDialog) {
    // ui/command.tsx's CommandDialog wraps only the Dialog chrome, not a cmdk root — the caller
    // supplies the actual <Command> (as shadcn's own docs examples do).
    return (
      <CommandDialog open={open} onOpenChange={(v) => onOpenChange?.(v)} className="sm:max-w-[560px]">
        <ShadcnCommand className={className}>{content}</ShadcnCommand>
      </CommandDialog>
    );
  }
  if (!open) return null;
  return <ShadcnCommand className={cn("border border-border shadow-lg", className)}>{content}</ShadcnCommand>;
}

// ---------------------------------------------------------------------------
// Toast, ToastRegion — hand-rolled composition, restyled with Tailwind (no sonner dependency)
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

const TOAST_ICON_TONE: Record<NonNullable<ToastDef["tone"]>, string> = {
  default: "text-muted-foreground",
  success: "text-status-success",
  error: "text-status-error",
  warning: "text-status-warning",
};

export function Toast({ title, description, tone = "default", icon, action, onAction, onDismiss, className = "" }: ToastDef & { onDismiss?: () => void; className?: string }) {
  const glyph = icon || (tone === "success" ? "CircleCheck" : tone === "error" ? "CircleX" : tone === "warning" ? "TriangleAlert" : "Info");
  return (
    <div role="status" className={cn("flex items-start gap-2.5 rounded-md border border-border bg-popover p-3 pl-3.5 text-sm text-foreground shadow-lg", className)}>
      <span className={cn("mt-px shrink-0", TOAST_ICON_TONE[tone])}><Icon name={glyph} size={16} /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title ? <div className="font-medium leading-tight">{title}</div> : null}
        {description ? <div className="text-sm leading-snug text-muted-foreground">{description}</div> : null}
      </div>
      {action ? <span className="ml-auto shrink-0 self-center"><Button size="sm" variant="outline" onClick={onAction}>{action}</Button></span> : null}
      {onDismiss ? <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={onDismiss}><Icon name="X" size={14} /></Button> : null}
    </div>
  );
}

export function ToastRegion({ toasts = [], onDismiss, className = "" }: { toasts?: ToastDef[]; onDismiss?: (id: string | number) => void; className?: string }) {
  return (
    <div className={cn("fixed right-4 bottom-4 z-[70] flex w-[360px] max-w-[calc(100%-32px)] flex-col gap-2", className)} aria-live="polite">
      {toasts.map((t) => <Toast key={t.id} {...t} onDismiss={onDismiss ? () => onDismiss(t.id) : undefined} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs (shadcn tabs.tsx — Base UI)
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
  const enclosed = variant === "enclosed";
  return (
    <ShadcnTabs value={value} defaultValue={initial} onValueChange={(v) => onValueChange?.(v as string)} className={cn("min-w-0 gap-0", className)}>
      <TabsList
        variant={enclosed ? "default" : "line"}
        className={cn(
          // TabsList's own height (`group-data-horizontal/tabs:h-8`) is gated behind that same
          // attribute variant — an unprefixed `h-*` override never wins the cascade against it.
          enclosed
            ? "group-data-horizontal/tabs:h-auto items-center gap-0.5 border border-border bg-[var(--surface-1)] p-[3px]"
            : "group-data-horizontal/tabs:h-9 w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0",
        )}
      >
        {items.map((it) => (
          <TabsTrigger
            key={it.value}
            value={it.value}
            disabled={it.disabled}
            className={cn(
              "gap-1.5 text-muted-foreground data-active:text-foreground",
              enclosed
                ? "h-[26px] rounded-sm px-2.5 text-xs data-active:bg-muted group-data-[variant=default]/tabs-list:data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-muted"
                : // The active-tab underline's position (`group-data-horizontal/tabs:after:bottom-[-5px]`)
                  // needs the same prefix to override; -1px sits it flush on the border, like the
                  // original's `margin-bottom:-1px` overlap.
                  "h-9 flex-none justify-start rounded-none border-0 bg-transparent px-3 after:bg-status-active group-data-horizontal/tabs:after:-bottom-px data-active:bg-transparent dark:data-active:bg-transparent dark:data-active:border-transparent",
            )}
          >
            {it.icon ? <Icon name={it.icon} size={14} /> : null}
            {it.label}
            {it.count !== undefined ? (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border border-border bg-secondary px-1 text-[11px] tabular-nums text-muted-foreground">{it.count}</span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.some((it) => it.content !== undefined) ? (
        items.map((it) => <TabsContent key={it.value} value={it.value} className="pt-3">{it.content}</TabsContent>)
      ) : children ? (
        <TabsContent value={initial ?? ""} className="pt-3">{children}</TabsContent>
      ) : null}
    </ShadcnTabs>
  );
}

// ---------------------------------------------------------------------------
// Resizable — two-panel drag split (no Base UI/shadcn equivalent; kept hand-rolled as instructed)
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
    <div ref={ref} className={cn("flex h-full w-full min-h-0", !horizontal && "flex-col", className)} style={style}>
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden" style={{ flex: `0 0 calc(${size}% - 0.5px)` }}>{first}</div>
      <div
        role="separator"
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        data-dragging={dragging || undefined}
        onPointerDown={onDown}
        className={cn(
          "relative z-2 flex-none touch-none bg-border select-none hover:bg-status-active data-[dragging]:bg-status-active",
          horizontal ? "w-px cursor-col-resize before:absolute before:-inset-x-1 before:inset-y-0" : "h-px cursor-row-resize before:absolute before:inset-x-0 before:-inset-y-1",
        )}
      >
        {showGrip ? (
          <span className={cn("absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[3px] border border-border bg-popover text-muted-foreground", horizontal ? "h-6 w-2.5" : "h-2.5 w-6")}>
            <Icon name={horizontal ? "GripVertical" : "GripHorizontal"} size={10} />
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{second}</div>
    </div>
  );
}
