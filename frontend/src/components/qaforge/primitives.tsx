"use client";

import * as React from "react";
import { Icon } from "./icon";

// Ported from the imported design project's component bundle (components/ui/**).
// Class names (qf-*) come from src/styles/qaforge/ui.css — kept 1:1 with the source so screens
// (ported near-verbatim from the design project's app/screens/*.jsx) don't need to change.

// ---------------------------------------------------------------------------
// actions/Button, actions/ButtonGroup, actions/Kbd
// ---------------------------------------------------------------------------

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "destructive-outline" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm" | "icon-lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconRight?: string;
  loading?: boolean;
}

export function Button({ variant = "secondary", size = "md", icon, iconRight, loading = false, disabled = false, className = "", children, type = "button", ...rest }: ButtonProps) {
  const isIcon = size === "icon" || size === "icon-sm" || size === "icon-lg";
  const sizeClass = size === "sm" || size === "icon-sm" ? "qf-btn--sm" : size === "lg" || size === "icon-lg" ? "qf-btn--lg" : "";
  const cls = ["qf-btn", `qf-btn--${variant}`, sizeClass, isIcon ? "qf-btn--icon" : "", className].filter(Boolean).join(" ");
  const iconSize = size === "sm" || size === "icon-sm" ? 14 : 16;
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="qf-btn__spinner"><Icon name="LoaderCircle" size={iconSize} /></span> : icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={iconSize} /> : null}
    </button>
  );
}

export function ButtonGroup({ children, className = "", ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="group" className={`qf-btn-group ${className}`.trim()} {...rest}>{children}</div>;
}

export function Kbd({ keys, children, className = "", ...rest }: { keys?: string[] } & React.HTMLAttributes<HTMLElement>) {
  if (keys && keys.length) {
    return (
      <span className={`qf-kbd-seq ${className}`.trim()} {...rest}>
        {keys.map((k, i) => <kbd key={i} className="qf-kbd">{k}</kbd>)}
      </span>
    );
  }
  return <kbd className={`qf-kbd ${className}`.trim()} {...rest}>{children}</kbd>;
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
    <div role="group" className={`qf-toggle-group ${className}`.trim()} {...rest}>
      {items.map((it) => (
        <button key={it.value} type="button" className={`qf-toggle ${size === "sm" ? "qf-toggle--sm" : ""}`.trim()} aria-pressed={isOn(it.value)} onClick={() => select(it.value)} title={it.title || it.label}>
          {it.icon ? <Icon name={it.icon} size={size === "sm" ? 14 : 16} /> : null}
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// data/Badge, data/Avatar, data/Separator, data/Spinner, data/Progress
// ---------------------------------------------------------------------------

export type Tone = "neutral" | "active" | "success" | "warning" | "error";

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

export function Badge({ tone = "neutral", solid = false, pill = false, size = "md", caseSensitive = false, mono = false, icon, dot = false, pulse = false, className = "", children, ...rest }: BadgeProps) {
  const cls = ["qf-badge", `qf-badge--${tone}`, solid ? "qf-badge--solid" : "", pill ? "qf-badge--pill" : "", size === "sm" ? "qf-badge--sm" : "", caseSensitive ? "qf-badge--case" : "", mono ? "qf-badge--mono" : "", className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {dot ? <span className={`qf-badge__dot ${pulse ? "qf-badge__dot--pulse" : ""}`.trim()} /> : icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

export function Avatar({ src, name = "", initials, size = "md", variant = "user", shape = "circle", className = "", ...rest }: {
  src?: string;
  name?: string;
  initials?: string;
  size?: "sm" | "md" | "lg";
  variant?: "user" | "agent";
  shape?: "circle" | "square";
} & React.HTMLAttributes<HTMLSpanElement>) {
  const fallback = initials || name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("");
  const cls = ["qf-avatar", size === "sm" ? "qf-avatar--sm" : size === "lg" ? "qf-avatar--lg" : "", variant === "agent" ? "qf-avatar--agent" : "", shape === "square" ? "qf-avatar--square" : "", className].filter(Boolean).join(" ");
  return (
    <span className={cls} title={name || undefined} {...rest}>
      {src ? <img src={src} alt={name} /> : variant === "agent" ? <Icon name="Bot" size={size === "sm" ? 12 : size === "lg" ? 18 : 14} /> : fallback}
    </span>
  );
}

export function Separator({ orientation = "horizontal", label, className = "", ...rest }: {
  orientation?: "horizontal" | "vertical";
  label?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  if (label) return <div role="separator" className={`qf-separator qf-separator--label ${className}`.trim()} {...rest}>{label}</div>;
  return <div role="separator" aria-orientation={orientation} className={`qf-separator ${orientation === "vertical" ? "qf-separator--v" : "qf-separator--h"} ${className}`.trim()} {...rest} />;
}

export function Spinner({ label, size = 16, className = "", ...rest }: { label?: React.ReactNode; size?: number } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`qf-spinner ${className}`.trim()} role="status" {...rest}>
      <span className="qf-spinner__icon"><Icon name="LoaderCircle" size={size} /></span>
      {label ? <span>{label}</span> : null}
    </span>
  );
}

export function Progress({ value = 0, max = 100, tone = "primary", size = "md", showValue = false, label, className = "", ...rest }: {
  value?: number;
  max?: number;
  tone?: "primary" | "success" | "warning" | "error";
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  label?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const bar = (
    <div
      className={`qf-progress ${size === "sm" ? "qf-progress--sm" : size === "lg" ? "qf-progress--lg" : ""} ${tone !== "primary" ? `qf-progress--${tone}` : ""} ${className}`.trim()}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      {...rest}
    >
      <div className="qf-progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
  if (!showValue) return bar;
  return <div className="qf-progress-row">{bar}<span className="qf-progress-row__value">{Math.round(pct)}%</span></div>;
}

// ---------------------------------------------------------------------------
// feedback/Alert
// ---------------------------------------------------------------------------

export function Alert({ tone = "default", icon, title, description, actions, className = "", children, ...rest }: {
  tone?: "default" | "info" | "success" | "warning" | "destructive";
  icon?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const glyph = icon || (tone === "destructive" ? "CircleX" : tone === "warning" ? "TriangleAlert" : tone === "success" ? "CircleCheck" : "Info");
  return (
    <div role={tone === "destructive" ? "alert" : "status"} className={`qf-alert ${tone !== "default" ? `qf-alert--${tone}` : ""} ${className}`.trim()} {...rest}>
      <span className="qf-alert__icon"><Icon name={glyph} size={16} /></span>
      {title ? <h4 className="qf-alert__title">{title}</h4> : null}
      {description ? <p className="qf-alert__description">{description}</p> : null}
      {children}
      {actions ? <div className="qf-alert__actions">{actions}</div> : null}
    </div>
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

export function Card({ title, description, actions, footer, padding = "default", variant = "default", interactive = false, titleSize = "md", className = "", children, ...rest }: CardProps) {
  const cls = ["qf-card", padding === "compact" ? "qf-card--compact" : padding === "large" ? "qf-card--large" : padding === "none" ? "qf-card--flush" : "", variant === "nested" ? "qf-card--nested" : variant === "elevated" ? "qf-card--elevated" : "", interactive ? "qf-card--interactive" : "", className].filter(Boolean).join(" ");
  const hasHeader = title || description || actions;
  return (
    <section className={cls} {...rest}>
      {hasHeader ? (
        <header className="qf-card__header">
          <div className="qf-card__heading">
            {title ? <h3 className={`qf-card__title ${titleSize === "sm" ? "qf-card__title--sm" : ""}`.trim()}>{title}</h3> : null}
            {description ? <p className="qf-card__description">{description}</p> : null}
          </div>
          {actions ? <div className="qf-card__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children !== undefined ? <div className="qf-card__content">{children}</div> : null}
      {footer ? <footer className="qf-card__footer">{footer}</footer> : null}
    </section>
  );
}

export function Empty({ icon = "FlaskConical", title, description, actions, className = "", ...rest }: {
  icon?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`qf-empty ${className}`.trim()} {...rest}>
      {icon ? <span className="qf-empty__icon"><Icon name={icon} size={18} /></span> : null}
      {title ? <h3 className="qf-empty__title">{title}</h3> : null}
      {description ? <p className="qf-empty__description">{description}</p> : null}
      {actions ? <div className="qf-empty__actions">{actions}</div> : null}
    </div>
  );
}

export interface BreadcrumbItemDef { label: React.ReactNode; href?: string; onClick?: () => void; mono?: boolean }

export function Breadcrumb({ items = [], className = "", ...rest }: { items?: BreadcrumbItemDef[] } & React.HTMLAttributes<HTMLElement>) {
  return (
    <nav aria-label="Breadcrumb" className={`qf-breadcrumb ${className}`.trim()} {...rest}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        const cls = it.mono ? "qf-breadcrumb__mono" : "";
        return (
          <React.Fragment key={i}>
            {i > 0 ? <span className="qf-breadcrumb__sep"><Icon name="ChevronRight" size={12} /></span> : null}
            {last ? (
              <span className={`qf-breadcrumb__current ${cls}`.trim()} aria-current="page">{it.label}</span>
            ) : it.href ? (
              <a href={it.href} className={cls}>{it.label}</a>
            ) : (
              <button type="button" className={`qf-breadcrumb__link ${cls}`.trim()} onClick={it.onClick}>{it.label}</button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
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

export function Table<Row>({ columns = [], rows = [], rowKey, compact = false, flush = false, onRowClick, selectedKey, emptyText = "No results.", rowClassName, className = "" }: TableProps<Row>) {
  const cellCls = (c: Column<Row>) => [c.align === "right" ? "qf-table__num" : "", c.mono ? "qf-table__mono" : "", c.muted ? "qf-table__muted" : ""].filter(Boolean).join(" ") || undefined;
  // ponytail: rows are typed (Run/Finding/…), not indexable — a narrow cast here lets a column
  // fall back to `row[c.key]` when it has no `render`, same as the untyped source did at runtime.
  const rowRecord = (row: Row) => row as unknown as Record<string, React.ReactNode>;
  return (
    <div className={`qf-table-wrap ${flush ? "qf-table-wrap--flush" : ""} ${className}`.trim()}>
      <table className={`qf-table ${compact ? "qf-table--compact" : ""}`.trim()}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align }} aria-sort={c.sorted || undefined}>
                {c.headerRender ? c.headerRender() : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="qf-table__empty"><td colSpan={columns.length}>{emptyText}</td></tr>
          ) : (
            rows.map((row, i) => {
              const k = typeof rowKey === "function" ? rowKey(row) : rowKey !== undefined ? (rowRecord(row)[rowKey as string] as unknown as string | number) : (rowRecord(row).id as unknown as string | number) ?? i;
              return (
                <tr key={k} data-clickable={onRowClick ? "true" : undefined} data-selected={selectedKey !== undefined && selectedKey === k ? "true" : undefined} className={rowClassName?.(row)} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                  {columns.map((c) => (
                    <td key={c.key} className={cellCls(c)} style={{ textAlign: c.align }}>
                      {c.render ? c.render(row) : rowRecord(row)[c.key]}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page = 1, pages = 1, onPageChange, siblings = 1, className = "" }: {
  page?: number;
  pages?: number;
  onPageChange?: (page: number) => void;
  siblings?: number;
  className?: string;
}) {
  const go = (p: number) => { if (p >= 1 && p <= pages) onPageChange?.(p); };
  const items: (number | string)[] = [];
  const lo = Math.max(2, page - siblings), hi = Math.min(pages - 1, page + siblings);
  items.push(1);
  if (lo > 2) items.push("…l");
  for (let p = lo; p <= hi; p += 1) items.push(p);
  if (hi < pages - 1) items.push("…r");
  if (pages > 1) items.push(pages);
  return (
    <nav className={`qf-pagination ${className}`.trim()} aria-label="Pagination">
      <button type="button" className="qf-pagination__page" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page"><Icon name="ChevronLeft" size={14} /></button>
      {items.map((it, i) => (typeof it === "string" ? (
        <span key={it + String(i)} className="qf-pagination__ellipsis">…</span>
      ) : (
        <button key={it} type="button" className="qf-pagination__page" aria-current={it === page ? "page" : undefined} onClick={() => go(it)}>{it}</button>
      )))}
      <button type="button" className="qf-pagination__page" onClick={() => go(page + 1)} disabled={page >= pages} aria-label="Next page"><Icon name="ChevronRight" size={14} /></button>
    </nav>
  );
}

export interface DataTableProps<Row> extends Omit<TableProps<Row>, "columns"> {
  columns: Column<Row>[];
  pageSize?: number;
  toolbar?: React.ReactNode;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  totalLabel?: string;
}

export function DataTable<Row>({ columns = [], rows = [], pageSize = 10, toolbar, defaultSort, rowKey, compact = false, onRowClick, selectedKey, emptyText, rowClassName, totalLabel = "rows", className = "" }: DataTableProps<Row>) {
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
    <div className={`qf-datatable ${className}`.trim()}>
      {toolbar ? <div className="qf-datatable__toolbar">{toolbar}</div> : null}
      <Table columns={cols} rows={slice} rowKey={rowKey} compact={compact} onRowClick={onRowClick} selectedKey={selectedKey} emptyText={emptyText} rowClassName={rowClassName} />
      {rows.length > 0 ? (
        <div className="qf-datatable__footer">
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
