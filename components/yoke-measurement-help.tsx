"use client";
import { useId, type ReactNode } from "react";
import { yokeFieldInfo, type YokeField } from "@/lib/yoke-measurement-fields";
import type { YokeMeasurementMode } from "@/lib/yoke-measurement-mode";
import { MeasurementPoint as Point } from "./yoke-measurement-point";

type Props = {
  active: YokeField;
  mode: YokeMeasurementMode;
  open: boolean;
  onOpen: (value: boolean) => void;
  onSelect: (field: YokeField) => void;
};
function Line({
  field,
  active,
  children,
}: {
  field: YokeField;
  active: YokeField;
  children: ReactNode;
}) {
  return (
    <g className={`measurement-lines ${field === active ? "is-active" : ""}`}>
      {children}
    </g>
  );
}

export function YokeMeasurementHelp({
  active,
  mode,
  open,
  onOpen,
  onSelect,
}: Props) {
  const id = useId().replaceAll(":", "");
  const info = yokeFieldInfo(active, mode);
  const sleeve = mode === "body" ? "sleeveEase" : "upperArm";
  const chest = mode === "body" ? "bodyEase" : "chest";
  const legend: { key: YokeField; text: string }[] = [
    { key: "chest", text: "1 Chest / body" },
    { key: "upperArm", text: "2 Arm / sleeve" },
    { key: "neck", text: "3 Neck opening" },
    { key: "depth", text: "4 Yoke length" },
    { key: "underarm", text: "5 Underarm width" },
    { key: "backRise", text: "6 Back height" },
    { key: "shoulderCircumference", text: "7 Shoulder circumference" },
    { key: "shoulderLength", text: "8 Shoulder length" },
    { key: "gaugeMeasure", text: "Gauge" },
    { key: "repeats", text: "Repeats" },
  ];
  return (
    <details
      className="yoke-measurement-guide"
      open={open}
      onToggle={(event) => onOpen(event.currentTarget.open)}
    >
      <summary>How to take these measurements</summary>
      <p>
        Choose a numbered point, or focus a measurement field. Dashed lines show
        the part of a circumference that wraps behind.
      </p>
      <div className="yoke-measurement-diagrams">
        <figure>
          <figcaption>Body · measure without added room</figcaption>
          <svg
            viewBox="0 0 320 355"
            role="group"
            aria-label="Body measurement diagram: chest and upper-arm tape paths wrap around the body, rather than measuring straight across."
          >
            <image
              href="/images/yoke/body-diagram.png"
              x="60"
              y="5"
              width="200"
              height="300"
            />
            <Line field="chest" active={mode === "body" ? active : "repeats"}>
              <path
                d="M121 125C121 109 199 109 199 125"
                strokeDasharray="4 3"
              />
              <path d="M121 125C121 141 199 141 199 125M199 125h39" />
            </Line>
            <Line
              field="upperArm"
              active={mode === "body" ? active : "repeats"}
            >
              <ellipse
                cx="112"
                cy="119"
                rx="13"
                ry="6"
                transform="rotate(12 112 119)"
                strokeDasharray="3 2"
              />
              <path d="M99 119H62" />
            </Line>
            <Point
              x={250}
              y={125}
              number={1}
              field="chest"
              active={active}
              onSelect={onSelect}
              diagram="Body"
              disabled={mode === "finished"}
            />
            <Point
              x={50}
              y={119}
              number={2}
              field="upperArm"
              active={active}
              onSelect={onSelect}
              diagram="Body"
              disabled={mode === "finished"}
            />
            <g className="measurement-labels">
              <text x="206" y="102">
                Chest / bust
              </text>
              <text x="12" y="87">
                Upper arm
              </text>
              <text x="160" y="312" textAnchor="middle">
                Tape around, not across
              </text>
              <text x="160" y="335" textAnchor="middle">
                {mode === "finished"
                  ? "Body reference · finished sizes use sweater"
                  : "Add desired room in the ease fields"}
              </text>
            </g>
          </svg>
        </figure>
        <figure>
          <figcaption>Sweater · finished dimensions</figcaption>
          <svg
            viewBox="0 0 320 275"
            role="group"
            aria-label="Sweater measurement diagram: finished circumferences, front yoke length, underarm cast-on bridge, extra back height and optional shoulder checkpoint."
          >
            <defs>
              <marker
                id={`${id}-arrow`}
                markerWidth="5"
                markerHeight="5"
                refX="2.5"
                refY="2.5"
                orient="auto-start-reverse"
              >
                <path d="M0 0L5 2.5 0 5" fill="none" stroke="context-stroke" />
              </marker>
            </defs>
            <image
              href="/images/yoke/sweater-diagram.png"
              x="20"
              y="25"
              width="280"
              height="187"
            />
            <Line field="neck" active={active}>
              <ellipse cx="160" cy="45" rx="24" ry="8" />
              <path d="M184 42l40-16" />
            </Line>
            <Point
              x={238}
              y={24}
              number={3}
              field="neck"
              active={active}
              onSelect={onSelect}
              diagram="Sweater"
            />
            <Line field={chest} active={active}>
              <path
                d="M100 145C100 133 213 133 213 145"
                strokeDasharray="4 3"
              />
              <path d="M100 145C100 157 213 157 213 145M213 145h25" />
            </Line>
            <Point
              x={250}
              y={145}
              number={1}
              field={chest}
              active={active}
              onSelect={onSelect}
              diagram="Sweater"
            />
            <Line field={sleeve} active={active}>
              <ellipse
                cx="83"
                cy="105"
                rx="17"
                ry="6"
                transform="rotate(30 83 105)"
                strokeDasharray="4 2"
              />
              <path d="M68 109l-25 28" />
            </Line>
            <Point
              x={31}
              y={144}
              number={2}
              field={sleeve}
              active={active}
              onSelect={onSelect}
              diagram="Sweater"
            />
            <Line field="depth" active={active}>
              <path
                d="M168 60v42"
                markerStart={`url(#${id}-arrow)`}
                markerEnd={`url(#${id}-arrow)`}
              />
              <path d="M104 102h108" strokeDasharray="2 4" />
            </Line>
            <Point
              x={188}
              y={104}
              number={4}
              field="depth"
              active={active}
              onSelect={onSelect}
              diagram="Sweater"
            />
            <Line field="shoulderCircumference" active={active}>
              <path d="M82 78C82 60 238 60 238 78" strokeDasharray="4 3" />
              <path d="M82 78C82 96 238 96 238 78M238 78h40" />
            </Line>
            <Point
              x={292}
              y={78}
              number={7}
              field="shoulderCircumference"
              active={active}
              onSelect={onSelect}
              diagram="Sweater"
            />
            <Line field="shoulderLength" active={active}>
              <path
                d="M148 60v18"
                markerStart={`url(#${id}-arrow)`}
                markerEnd={`url(#${id}-arrow)`}
              />
            </Line>
            <Point
              x={130}
              y={79}
              number={8}
              field="shoulderLength"
              active={active}
              onSelect={onSelect}
              diagram="Sweater"
            />
            <g className="measurement-labels">
              <text x="160" y="229" textAnchor="middle">
                1 &amp; 2: full circumference
              </text>
              <text x="160" y="246" textAnchor="middle">
                4 &amp; 8: along front fabric
              </text>
              <text x="160" y="263" textAnchor="middle">
                7: around torso + both sleeves
              </text>
            </g>
          </svg>
        </figure>
        <figure className="measurement-detail">
          <figcaption>5 · Underarm cast-on width</figcaption>
          <svg
            viewBox="0 0 320 220"
            role="group"
            aria-label="Underarm detail: highlighted stitches bridge the sleeve and body at one underarm."
          >
            <image
              href="/images/yoke/underarm-diagram.png"
              x="0"
              y="0"
              width="320"
              height="213"
            />
            <Line field="underarm" active={active}>
              <path d="M125 133h27M152 133l102 15" />
              <path d="M125 129v8M152 129v8" />
            </Line>
            <Point
              x={268}
              y={150}
              number={5}
              field="underarm"
              active={active}
              onSelect={onSelect}
              diagram="Sweater"
            />
          </svg>
          <p>
            Measure the highlighted bridge at one underarm—not around the
            armhole.
          </p>
        </figure>
        <figure className="measurement-detail">
          <figcaption>6 · Extra back-neck height</figcaption>
          <svg
            viewBox="0 0 320 220"
            role="group"
            aria-label="Back-neck detail, viewed straight from behind: highlighted short-row fabric is deepest at centre back and tapers towards both shoulders."
          >
            <image
              href="/images/yoke/back-rise-diagram-v2.png"
              x="0"
              y="0"
              width="320"
              height="213"
            />
            <Line field="backRise" active={active}>
              <path d="M160 68l92-29" />
            </Line>
            <Point
              x={266}
              y={32}
              number={6}
              field="backRise"
              active={active}
              onSelect={onSelect}
              diagram="Sweater"
            />
          </svg>
          <p>
            Back view: extra height is added at centre back, tapering towards
            both shoulders.
          </p>
        </figure>
      </div>
      <div className="measurement-guide-selection" aria-live="polite">
        <strong>{info.label}</strong>
        <p>{info.help}</p>
      </div>
      <div className="measurement-guide-legend">
        {legend.map((item) => (
          <button
            type="button"
            key={item.key}
            aria-pressed={active === item.key}
            onClick={() => onSelect(item.key)}
          >
            {item.text}
          </button>
        ))}
      </div>
    </details>
  );
}
