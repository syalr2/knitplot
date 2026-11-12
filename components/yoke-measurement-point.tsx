import type { YokeField } from "@/lib/yoke-measurement-fields";

export function MeasurementPoint({
  x,
  y,
  number,
  field,
  active,
  onSelect,
  diagram,
  disabled = false,
}: {
  x: number;
  y: number;
  number: number;
  field: YokeField;
  active: YokeField;
  onSelect: (field: YokeField) => void;
  diagram: string;
  disabled?: boolean;
}) {
  return (
    <g
      className={`measurement-point ${active === field && !disabled ? "is-active" : ""}`}
      data-field={field}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={`${diagram} diagram point ${number}`}
      aria-pressed={!disabled && active === field}
      transform={`translate(${x} ${y})`}
      onClick={() => {
        if (!disabled) onSelect(field);
      }}
      onKeyDown={(event) => {
        if (!disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect(field);
        }
      }}
    >
      <circle r="12" />
      <text textAnchor="middle" dominantBaseline="central">
        {number}
      </text>
    </g>
  );
}
