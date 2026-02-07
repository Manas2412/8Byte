"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  User,
  LogOut,
} from "lucide-react";
import { cn } from "@/app/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export default function UserLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const authChecked = useRef(false);

  useEffect(() => {
    if (authChecked.current) return;
    authChecked.current = true;

    const token = getToken();
    if (!token) {
      window.location.href = "/sign-in";
      return;
    }
    fetch(`${API_URL}/api/v1/users/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((res) => {
        if (res.status === 401) {
          localStorage.removeItem("token");
          window.location.href = "/sign-in";
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then(() => setLoading(false))
      .catch(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/sign-in";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center">
        <p className="text-white/90">Loading…</p>
      </div>
    );
  }

  const nav = [
    { href: "/user", label: "Dashboard", icon: LayoutDashboard },
    { href: "/user/stocks", label: "Stock", icon: TrendingUp },
  ];
  const accountNav = [
    { href: "/user/profile", label: "Profile", icon: User },
  ];

  return (
    <div className="min-h-screen bg-charcoal text-white flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-white/10 bg-[#2a2a2a] flex flex-col">
        <div className="p-4 border-b border-white/10">
          <Link href="/user" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-[#f97316] flex items-center justify-center text-white font-bold text-sm">
              8
            </div>
            <span className="font-semibold text-white/95">Header</span>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/80 text-sm transition-colors",
                pathname === item.href
                  ? "bg-black/40 text-white"
                  : "hover:bg-white/10 hover:text-white/95"
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {item.label}
            </Link>
          ))}
          <div className="pt-4 mt-4 border-t border-white/10">
            <p className="px-3 py-1 text-xs font-medium text-white/50 uppercase tracking-wider">
              Account
            </p>
            {accountNav.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/80 text-sm transition-colors",
                  pathname === item.href
                    ? "bg-black/40 text-white"
                    : "hover:bg-white/10 hover:text-white/95"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-white/10 bg-[#2a2a2a] flex items-center justify-between px-6 gap-4 shrink-0">
          <div className="flex-1 max-w-md">
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors border-l border-white/10 ml-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
