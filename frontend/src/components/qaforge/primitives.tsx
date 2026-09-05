"use client";

import * as React from "react";
import { Icon } from "./icon";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Kbd as ShadcnKbd, KbdGroup } from "@/components/ui/kbd";
import { Toggle } from "@/components/ui/toggle";
import { Badge as ShadcnBadge } from "@/components/ui/badge";
import { Avatar as ShadcnAvatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator as ShadcnSeparator } from "@/components/ui/separator";
import { Spinner as ShadcnSpinner } from "@/components/ui/spinner";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { ProgressTrack, ProgressIndicator } from "@/components/ui/progress";

import { Alert as ShadcnAlert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Card as ShadcnCard, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from "@/components/ui/card";
import { Empty as ShadcnEmpty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { Breadcrumb as ShadcnBreadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Table as ShadcnTable, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Pagination as ShadcnPagination, PaginationContent, PaginationItem, PaginationLink, PaginationEllipsis } from "@/components/ui/pagination";
import { cn } from "cn";

// Adapter layer: same exports/props as the original qf-* primitives (ported from the imported
// design project's component bundle, components/ui/**) so screens don't change — internals now
// render real shadcn/ui (Base UI flavor) components instead of qf-* CSS classes.

// ---------------------------------------------------------------------------
// actions/Button, actions/ButtonGroup, actions/Kbd
// ---------------------------------------------------------------------------

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "destructive-outline" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm" | "icon-lg";

const BUTTON_VARIANT_MAP: Record<ButtonVariant, "default" | "secondary" | "outline" | "ghost" | "destructive" | "destructive-outline" | "link"> = {
  primary: "default",
  secondary: "secondary",
  outline: "outline",
  ghost: "ghost",
  destructive: "destructive",
  "destructive-outline": "destructive-outline",
  link: "link",
};

const BUTTON_SIZE_MAP: Record<ButtonSize, "default" | "sm" | "lg" | "icon" | "icon-sm" | "icon-lg"> = {
  sm: "sm",
  md: "default",
  lg: "lg",
  icon: "icon",
  "icon-sm": "icon-sm",
  "icon-lg": "icon-lg",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconRight?: string;
  loading?: boolean;
}

export function Button({ variant = "secondary", size = "md", icon, iconRight, loading = false, disabled = false, className, children, type = "button", ...rest }: ButtonProps) {
  const iconSize = size === "sm" || size === "icon-sm" ? 14 : 16;
  return (
    <ShadcnButton
      type={type}
      variant={BUTTON_VARIANT_MAP[variant]}
      size={BUTTON_SIZE_MAP[size]}
      className={className}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Icon name="LoaderCircle" size={iconSize} className="animate-spin" /> : icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={iconSize} /> : null}
    </ShadcnButton>
  );
}

export function ButtonGroup({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="group" data-slot="button-group" className={cn("inline-flex items-center", className)} {...rest}>{children}</div>;
}

export function Kbd({ keys, children, className, ...rest }: { keys?: string[] } & React.HTMLAttributes<HTMLElement>) {
  if (keys && keys.length) {
    return (
      <KbdGroup className={className} {...rest}>
        {keys.map((k, i) => <ShadcnKbd key={i}>{k}</ShadcnKbd>)}
      </KbdGroup>
    );
  }
  return <ShadcnKbd className={className} {...rest}>{children}</ShadcnKbd>;
}

// ---------------------------------------------------------------------------
// actions/ToggleGroup (multi-select level filter, used by ConsoleViewer)
// ---------------------------------------------------------------------------

export interface ToggleGroupItem { value: string; label?: string; icon?: string; title?: string }

export function ToggleGroup({ items = [], value, defaultValue, onValueChange, type = "single", size = "md", className = "", ...rest }: {
  items?: ToggleGroupItem[];
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (v: string | string[]) => void;
  type?: "single" | "multiple";
  size?: "sm" | "md";
} & React.HTMLAttributes<HTMLDivElement>) {
  const [internal, setInternal] = React.useState<string | string[]>(defaultValue !== undefined ? defaultValue : type === "multiple" ? [] : "");
  const current = value !== undefined ? value : internal;
  const isOn = (v: string) => (type === "multiple" ? (current as string[]).includes(v) : current === v);
  const select = (v: string) => {
    let next: string | string[];
    if (type === "multiple") {
      const arr = current as string[];
      next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    } else next = v;
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  };
  return (
    <div role="group" className={cn("inline-flex items-center gap-0.5 rounded-md border border-border bg-secondary p-0.5", className)} {...rest}>
      {items.map((it) => (
        <Toggle
          key={it.value}
          size={size === "sm" ? "sm" : "default"}
          pressed={isOn(it.value)}
          onPressedChange={() => select(it.value)}
          title={it.title || it.label}
        >
          {it.icon ? <Icon name={it.icon} size={size === "sm" ? 14 : 16} /> : null}
          {it.label}
        </Toggle>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// data/Badge, data/Avatar, data/Separator, data/Spinner, data/Progress
// ---------------------------------------------------------------------------

export type Tone = "neutral" | "active" | "success" | "warning" | "error";

// Outline (default) and solid className pairs per tone — QAForge's tone system has no shadcn
// equivalent (shadcn's Badge variants are default/secondary/destructive/outline/ghost/link), so
// it's layered on top of the shadcn Badge via className using the status-* tokens from globals.css.
const BADGE_TONE: Record<Tone, { outline: string; solid: string }> = {
  neutral: { outline: "border-border-strong! bg-transparent text-muted-foreground", solid: "border-border-strong! bg-secondary text-foreground" },
  active: { outline: "border-status-active/45 bg-transparent text-status-active", solid: "border-primary! bg-primary text-primary-foreground" },
  success: { outline: "border-status-success/45 bg-transparent text-status-success", solid: "border-status-success/60 bg-status-success-muted text-foreground" },
  warning: { outline: "border-status-warning/45 bg-transparent text-status-warning", solid: "border-status-warning/60 bg-status-warning-muted text-foreground" },
  error: { outline: "border-status-error/45 bg-transparent text-status-error", solid: "border-status-error/60 bg-status-error-muted text-foreground" },
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  solid?: boolean;
  pill?: boolean;
  size?: "sm" | "md";
  caseSensitive?: boolean;
  mono?: boolean;
  icon?: string;
  dot?: boolean;
  pulse?: boolean;
}

export function Badge({ tone = "neutral", solid = false, pill = false, size = "md", caseSensitive = false, mono = false, icon, dot = false, pulse = false, className, children, ...rest }: BadgeProps) {
  const tones = BADGE_TONE[tone];
  return (
    <ShadcnBadge
      className={cn(
        solid ? tones.solid : tones.outline,
        !caseSensitive && "uppercase tracking-wide",
        mono && "font-mono normal-case tracking-normal",
        pill && "rounded-full",
        size === "sm" && "h-[18px] px-1.5 text-[10px]",
        className,
      )}
      {...rest}
    >
      {dot ? <span className={cn("size-1.5 shrink-0 rounded-full bg-current", pulse && "animate-pulse")} /> : icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </ShadcnBadge>
  );
}

export function Avatar({ src, name = "", initials, size = "md", variant = "user", shape = "circle", className, ...rest }: {
  src?: string;
  name?: string;
  initials?: string;
  size?: "sm" | "md" | "lg";
  variant?: "user" | "agent";
  shape?: "circle" | "square";
} & React.HTMLAttributes<HTMLSpanElement>) {
  const fallback = initials || name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("");
  return (
    <ShadcnAvatar
      size={size === "sm" ? "sm" : size === "lg" ? "lg" : "default"}
      className={cn(shape === "square" && "rounded-sm after:rounded-sm", variant === "agent" && "bg-status-active-muted", className)}
      title={name || undefined}
      {...(rest as React.ComponentProps<typeof ShadcnAvatar>)}
    >
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback className={cn(variant === "agent" && "bg-transparent text-status-active")}>
        {variant === "agent" ? <Icon name="Bot" size={size === "sm" ? 12 : size === "lg" ? 18 : 14} /> : fallback}
      </AvatarFallback>
    </ShadcnAvatar>
  );
}

export function Separator({ orientation = "horizontal", label, className, ...rest }: {
  orientation?: "horizontal" | "vertical";
  label?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  if (label) {
    return (
      <div role="separator" className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)} {...rest}>
        <ShadcnSeparator className="flex-1" />
        {label}
        <ShadcnSeparator className="flex-1" />
      </div>
    );
  }
  return <ShadcnSeparator orientation={orientation} className={className} {...(rest as React.ComponentProps<typeof ShadcnSeparator>)} />;
}

export function Spinner({ label, size = 16, className, ...rest }: { label?: React.ReactNode; size?: number } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)} role="status" {...rest}>
      <ShadcnSpinner className="text-status-active" style={{ width: size, height: size }} />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

const PROGRESS_TONE: Record<"success" | "warning" | "error", string> = {
  success: "bg-status-success",
  warning: "bg-status-warning",
  error: "bg-status-error",
};

export function Progress({ value = 0, max = 100, tone = "primary", size = "md", showValue = false, label, className, ...rest }: {
  value?: number;
  max?: number;
  tone?: "primary" | "success" | "warning" | "error";
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  label?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const bar = (
    <ProgressPrimitive.Root value={pct} aria-label={label} data-slot="progress" className={className} {...rest}>
      <ProgressTrack className={size === "sm" ? "h-1" : size === "lg" ? "h-2" : "h-1.5"}>
        <ProgressIndicator className={tone === "primary" ? "bg-primary" : PROGRESS_TONE[tone]} />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  );
  if (!showValue) return bar;
  return <div className="flex items-center gap-2.5">{bar}<span className="w-9 text-right text-sm tabular-nums text-foreground">{Math.round(pct)}%</span></div>;
}

// ---------------------------------------------------------------------------
// feedback/Alert
// ---------------------------------------------------------------------------

const ALERT_TONE: Record<"info" | "success" | "warning" | "destructive", string> = {
  info: "border-status-active/45 bg-status-active-muted [&_svg]:text-status-active",
  success: "border-status-success/45 bg-status-success-muted [&_svg]:text-status-success",
  warning: "border-status-warning/45 bg-status-warning-muted [&_svg]:text-status-warning",
  destructive: "border-status-error/45 bg-status-error-muted [&_svg]:text-status-error text-foreground",
};

export function Alert({ tone = "default", icon, title, description, actions, className, children, ...rest }: {
  tone?: "default" | "info" | "success" | "warning" | "destructive";
  icon?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const glyph = icon || (tone === "destructive" ? "CircleX" : tone === "warning" ? "TriangleAlert" : tone === "success" ? "CircleCheck" : "Info");
  return (
    <ShadcnAlert
      variant={tone === "destructive" ? "destructive" : "default"}
      className={cn(tone !== "default" && ALERT_TONE[tone], className)}
      {...rest}
    >
      <Icon name={glyph} size={16} />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      {description ? <AlertDescription>{description}</AlertDescription> : null}
      {children}
      {actions ? <div className="col-start-2 mt-2 flex gap-2">{actions}</div> : null}
    </ShadcnAlert>
  );
}

// ---------------------------------------------------------------------------
// layout/Card, layout/Empty, layout/Breadcrumb
// ---------------------------------------------------------------------------

export interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  padding?: "compact" | "default" | "large" | "none";
  variant?: "default" | "nested" | "elevated";
  interactive?: boolean;
  titleSize?: "sm" | "md";
}

export function Card({ title, description, actions, footer, padding = "default", variant = "default", interactive = false, titleSize = "md", className, children, ...rest }: CardProps) {
  const hasHeader = title || description || actions;
  return (
    <ShadcnCard
      className={cn(
        "rounded-md ring-0",
        variant === "nested" && "bg-secondary",
        variant === "elevated" && "bg-popover",
        interactive && "cursor-pointer transition-colors hover:bg-secondary hover:border-border-strong",
        padding === "compact" && "gap-3 [--card-spacing:--spacing(3)]",
        padding === "large" && "gap-5 [--card-spacing:--spacing(5)]",
        padding === "none" && "gap-0",
        className,
      )}
      {...rest}
    >
      {hasHeader ? (
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title ? <CardTitle className={cn(titleSize === "sm" && "text-sm font-medium")}>{title}</CardTitle> : null}
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {actions ? <CardAction className="static flex shrink-0 items-center gap-2">{actions}</CardAction> : null}
        </CardHeader>
      ) : null}
      {children !== undefined ? <CardContent className={cn("flex flex-col gap-3", padding === "none" && "px-0")}>{children}</CardContent> : null}
      {footer ? <CardFooter className="bg-transparent">{footer}</CardFooter> : null}
    </ShadcnCard>
  );
}

export function Empty({ icon = "FlaskConical", title, description, actions, className, ...rest }: {
  icon?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <ShadcnEmpty className={cn("border border-dashed", className)} {...rest}>
      <EmptyHeader>
        {icon ? <EmptyMedia variant="icon"><Icon name={icon} size={18} /></EmptyMedia> : null}
        {title ? <EmptyTitle>{title}</EmptyTitle> : null}
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {actions ? <EmptyContent className="flex-row">{actions}</EmptyContent> : null}
    </ShadcnEmpty>
  );
}

export interface BreadcrumbItemDef { label: React.ReactNode; href?: string; onClick?: () => void; mono?: boolean }

export function Breadcrumb({ items = [], className, ...rest }: { items?: BreadcrumbItemDef[] } & React.HTMLAttributes<HTMLElement>) {
  return (
    <ShadcnBreadcrumb className={className} {...rest}>
      <BreadcrumbList className="flex-nowrap gap-1.5">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <React.Fragment key={i}>
              {i > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem className={cn(it.mono && "font-mono text-xs")}>
                {last ? (
                  <BreadcrumbPage className={cn(it.mono && "font-mono text-xs")}>{it.label}</BreadcrumbPage>
                ) : it.href ? (
                  <BreadcrumbLink href={it.href}>{it.label}</BreadcrumbLink>
                ) : (
                  <BreadcrumbLink render={<button type="button" onClick={it.onClick} />}>{it.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </ShadcnBreadcrumb>
  );
}

// ---------------------------------------------------------------------------
// data/Table, data/DataTable, data/Pagination
// ---------------------------------------------------------------------------

export interface Column<Row> {
  key: string;
  header: React.ReactNode;
  headerRender?: () => React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
  muted?: boolean;
  width?: number | string;
  sortable?: boolean;
  sorted?: "ascending" | "descending";
  sortValue?: (row: Row) => string | number;
  render?: (row: Row) => React.ReactNode;
}

export interface TableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  rowKey?: keyof Row | ((row: Row) => string | number);
  compact?: boolean;
  flush?: boolean;
  onRowClick?: (row: Row) => void;
  selectedKey?: string | number;
  emptyText?: string;
  rowClassName?: (row: Row) => string | undefined;
  className?: string;
}

export function Table<Row>({ columns = [], rows = [], rowKey, compact = false, flush = false, onRowClick, selectedKey, emptyText = "No results.", rowClassName, className }: TableProps<Row>) {
  const cellCls = (c: Column<Row>) => cn(c.align === "right" && "text-right tabular-nums", c.mono && "font-mono text-xs", c.muted && "text-muted-foreground");
  // ponytail: rows are typed (Run/Finding/…), not indexable — a narrow cast here lets a column
  // fall back to `row[c.key]` when it has no `render`, same as the untyped source did at runtime.
  const rowRecord = (row: Row) => row as unknown as Record<string, React.ReactNode>;
  const rowHeight = compact ? "[&_td]:h-8" : "[&_td]:h-10";
  return (
    <div className={cn(!flush && "rounded-md border border-border bg-card", className)}>
      <ShadcnTable className={cn("tabular-nums", rowHeight)}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => (
              <TableHead key={c.key} style={{ width: c.width, textAlign: c.align }} aria-sort={c.sorted || undefined}>
                {c.headerRender ? c.headerRender() : c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-[120px] text-center text-muted-foreground">{emptyText}</TableCell>
            </TableRow>
          ) : (
            rows.map((row, i) => {
              const k = typeof rowKey === "function" ? rowKey(row) : rowKey !== undefined ? (rowRecord(row)[rowKey as string] as unknown as string | number) : (rowRecord(row).id as unknown as string | number) ?? i;
              return (
                <TableRow
                  key={k}
                  data-clickable={onRowClick ? "true" : undefined}
                  data-selected={selectedKey !== undefined && selectedKey === k ? "true" : undefined}
                  className={cn(onRowClick && "cursor-pointer", selectedKey !== undefined && selectedKey === k && "bg-muted", rowClassName?.(row))}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c) => (
                    <TableCell key={c.key} className={cellCls(c)} style={{ textAlign: c.align }}>
                      {c.render ? c.render(row) : rowRecord(row)[c.key]}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </ShadcnTable>
    </div>
  );
}

export function Pagination({ page = 1, pages = 1, onPageChange, siblings = 1, className }: {
  page?: number;
  pages?: number;
  onPageChange?: (page: number) => void;
  siblings?: number;
  className?: string;
}) {
  const go = (e: React.MouseEvent, p: number) => { e.preventDefault(); if (p >= 1 && p <= pages) onPageChange?.(p); };
  const items: (number | string)[] = [];
  const lo = Math.max(2, page - siblings), hi = Math.min(pages - 1, page + siblings);
  items.push(1);
  if (lo > 2) items.push("…l");
  for (let p = lo; p <= hi; p += 1) items.push(p);
  if (hi < pages - 1) items.push("…r");
  if (pages > 1) items.push(pages);
  return (
    <ShadcnPagination className={cn("mx-0 w-fit justify-start", className)}>
      <PaginationContent>
        <PaginationItem>
          <PaginationLink href="#" size="icon-sm" aria-label="Previous page" aria-disabled={page <= 1} className={cn(page <= 1 && "pointer-events-none opacity-40")} onClick={(e) => go(e, page - 1)}>
            <Icon name="ChevronLeft" size={14} />
          </PaginationLink>
        </PaginationItem>
        {items.map((it, i) => (
          <PaginationItem key={it + String(i)}>
            {typeof it === "string" ? <PaginationEllipsis /> : (
              <PaginationLink href="#" size="icon-sm" isActive={it === page} onClick={(e) => go(e, it)}>{it}</PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationLink href="#" size="icon-sm" aria-label="Next page" aria-disabled={page >= pages} className={cn(page >= pages && "pointer-events-none opacity-40")} onClick={(e) => go(e, page + 1)}>
            <Icon name="ChevronRight" size={14} />
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </ShadcnPagination>
  );
}

export interface DataTableProps<Row> extends Omit<TableProps<Row>, "columns"> {
  columns: Column<Row>[];
  pageSize?: number;
  toolbar?: React.ReactNode;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  totalLabel?: string;
}

export function DataTable<Row>({ columns = [], rows = [], pageSize = 10, toolbar, defaultSort, rowKey, compact = false, onRowClick, selectedKey, emptyText, rowClassName, totalLabel = "rows", className }: DataTableProps<Row>) {
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(defaultSort || null);
  const [page, setPage] = React.useState(1);
  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const get = (r: Row) => (col?.sortValue ? col.sortValue(r) : ((r as unknown as Record<string, string | number>)[sort.key]));
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      const cmp = x > y ? 1 : x < y ? -1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages);
  const slice = sorted.slice((cur - 1) * pageSize, cur * pageSize);
  const toggleSort = (key: string) => setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  const cols: Column<Row>[] = columns.map((c) => (!c.sortable ? c : {
    ...c,
    sorted: sort && sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined,
    headerRender: () => (
      <button type="button" onClick={() => toggleSort(c.key)}>
        {c.header}
        <Icon name={sort && sort.key === c.key ? (sort.dir === "asc" ? "ChevronUp" : "ChevronDown") : "ChevronsUpDown"} size={12} />
      </button>
    ),
  }));
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {toolbar ? <div className="flex flex-wrap items-center justify-between gap-3">{toolbar}</div> : null}
      <Table columns={cols} rows={slice} rowKey={rowKey} compact={compact} onRowClick={onRowClick} selectedKey={selectedKey} emptyText={emptyText} rowClassName={rowClassName} />
      {rows.length > 0 ? (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{sorted.length === 0 ? "" : `${(cur - 1) * pageSize + 1}–${Math.min(cur * pageSize, sorted.length)} of ${sorted.length} ${totalLabel}`}</span>
          {pages > 1 ? <Pagination page={cur} pages={pages} onPageChange={setPage} /> : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// data/Chart
// ---------------------------------------------------------------------------

export interface ChartSeries { data: number[]; color?: string }
export interface ChartLegendItem { label: string; color?: string }

export function Chart({ type = "bar", data = [], series, height = 120, max, showAxis = true, legend, formatValue = (v: number) => String(v), className = "" }: {
  type?: "bar" | "line";
  data?: { label: string; value: number; tone?: string }[];
  series?: ChartSeries[];
  height?: number;
  max?: number;
  showAxis?: boolean;
  legend?: ChartLegendItem[];
  formatValue?: (v: number) => string;
  className?: string;
}) {
  const values = series ? series.flatMap((s) => s.data) : data.map((d) => d.value);
  const top = max !== undefined ? max : Math.max(1, ...values);
  if (type === "line") {
    const w = 400, h = height, pad = 4;
    const lines = (series || [{ data: values, color: "var(--chart-1)" }]).map((s, si) => {
      const n = s.data.length;
      const pts = s.data.map((v, i) => `${pad + (i * (w - pad * 2)) / Math.max(1, n - 1)},${h - pad - (v / top) * (h - pad * 2)}`).join(" ");
      return <polyline key={si} points={pts} fill="none" stroke={s.color || (si === 0 ? "var(--chart-1)" : "var(--chart-3)")} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
    });
    const grid = [0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={w} y1={h * f} y2={h * f} />);
    return (
      <div className={`qf-chart ${className}`.trim()}>
        <div className="qf-chart__plot" style={{ height }}>
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={height} style={{ display: "block", overflow: "visible" }}>
            <g className="qf-chart__grid">{grid}</g>
            {lines}
          </svg>
        </div>
        {showAxis && data.length ? <div className="qf-chart__axis"><span>{data[0].label}</span><span>{data[data.length - 1].label}</span></div> : null}
        {legend ? <div className="qf-chart__legend">{legend.map((l) => <span key={l.label} className="qf-chart__legend-item"><span className="qf-chart__swatch" style={{ background: l.color }} />{l.label}</span>)}</div> : null}
      </div>
    );
  }
  return (
    <div className={`qf-chart ${className}`.trim()}>
      <div className="qf-chart__plot" style={{ height }}>
        <div className="qf-chart__bars">
          {data.map((d, i) => (
            <div key={i} className={`qf-chart__bar ${d.tone ? `qf-chart__bar--${d.tone}` : ""}`.trim()} style={{ height: `${Math.max(2, (d.value / top) * 100)}%` }} title={`${d.label}: ${formatValue(d.value)}`} />
          ))}
        </div>
      </div>
      {showAxis && data.length ? (
        <div className="qf-chart__axis">
          <span>{data[0].label}</span>
          {data.length > 2 ? <span>{data[Math.floor(data.length / 2)].label}</span> : null}
          <span>{data[data.length - 1].label}</span>
        </div>
      ) : null}
      {legend ? <div className="qf-chart__legend">{legend.map((l) => <span key={l.label} className="qf-chart__legend-item"><span className="qf-chart__swatch" style={{ background: l.color }} />{l.label}</span>)}</div> : null}
    </div>
  );
}
