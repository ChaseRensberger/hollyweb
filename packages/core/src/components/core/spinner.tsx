import { cn } from "#lib/utils";
type SpinnerProps = {
  size?: number;
  duration?: number;
  offOpacity?: number;
  className?: string;
  label?: string;
};
export function Spinner({
  size = 24,
  duration = 1,
  offOpacity = 0.2,
  className,
  label = "Loading",
}: SpinnerProps) {
  return (
    <svg
      data-slot="spinner"
      role="status"
      aria-label={label}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("animate-spin text-primary", className)}
      style={{ animationDuration: `${duration}s` }}
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity={offOpacity}
      />
      <path
        d="M3 12V6a3 3 0 0 1 3-3h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
