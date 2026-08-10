import { ACCOUNT_COLORS, ACCOUNT_SYMBOLS, type AccountAvatar as Avatar } from "@/lib/account-preferences";

type Props = { avatar: Avatar; className?: string };

export function AccountAvatar({ avatar, className = "" }: Props) {
  const text = avatar.kind === "symbol" ? ACCOUNT_SYMBOLS[avatar.value] : avatar.value;
  return <span className={`account-avatar ${avatar.kind} ${className}`.trim()} style={{ backgroundColor: ACCOUNT_COLORS[avatar.color] }} aria-hidden="true">{text}</span>;
}
