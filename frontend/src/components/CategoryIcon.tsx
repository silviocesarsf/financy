import {
  Briefcase,
  Car,
  CircleDashed,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  PawPrint,
  PiggyBank,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Tv,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  'shopping-cart': ShoppingCart,
  car: Car,
  home: Home,
  tv: Tv,
  'heart-pulse': HeartPulse,
  'shopping-bag': ShoppingBag,
  'gamepad-2': Gamepad2,
  'graduation-cap': GraduationCap,
  plane: Plane,
  smartphone: Smartphone,
  'paw-print': PawPrint,
  'circle-dashed': CircleDashed,
  briefcase: Briefcase,
  wallet: Wallet,
  'trending-up': TrendingUp,
  'piggy-bank': PiggyBank,
  gift: Gift,
  receipt: Receipt,
  zap: Zap,
};

export function CategoryIcon({ icon, color, size = 'md' }: { icon?: string; color?: string; size?: 'sm' | 'md' }) {
  const Icon = CATEGORY_ICONS[icon ?? ''] ?? CircleDashed;
  const c = color ?? '#94a3b8';
  return (
    <span
      className={size === 'sm' ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg' : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl'}
      style={{ background: `${c}1f`, color: c }}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </span>
  );
}
