import { Link } from "react-router-dom";

export const Logo = ({ className = "" }: { className?: string }) => (
  <Link to="/" className={`group inline-flex items-center gap-2 ${className}`}>
    <span className="relative flex h-8 w-8 items-center justify-center rounded-lg gradient-warm shadow-elevated">
      <span className="font-display text-lg font-bold text-primary-foreground">K</span>
    </span>
    <span className="font-display text-xl font-semibold tracking-tight">
      Keja
    </span>
  </Link>
);