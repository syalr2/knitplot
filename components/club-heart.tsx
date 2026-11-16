export function ClubHeart({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    >
      <path d="M12 20.5 4.6 13.3C.3 9.1 6.2 3.1 10.4 7.2L12 8.8l1.6-1.6c4.2-4.1 10.1 1.9 5.8 6.1Z" />
    </svg>
  );
}
