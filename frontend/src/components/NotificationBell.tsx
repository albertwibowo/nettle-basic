"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, apiPost } from "@/lib/api";

interface Notification {
  id: string;
  report: string | null;
  event_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const POLL_MS = 5000;

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadUnread = useCallback(() => {
    apiFetch("/api/notifications/?unread=1")
      .then((data: Notification[]) => setNotifications(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadUnread();
    const timer = setInterval(loadUnread, POLL_MS);
    return () => clearInterval(timer);
  }, [loadUnread]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const unreadCount = notifications.length;

  const markRead = async (n: Notification) => {
    try {
      await apiPost(`/api/notifications/${n.id}/read/`, {});
      setNotifications((prev) => prev.filter((x) => x.id !== n.id));
    } catch {
      /* ignore */
    }
  };

  const markAllRead = async () => {
    try {
      await apiPost("/api/notifications/read-all/", {});
      setNotifications([]);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative ml-auto" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center rounded-full bg-sky-500 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
            <span className="text-sm font-medium text-zinc-200">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-sky-400 hover:text-sky-300"
              >
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-sm text-zinc-500 text-center">
              No unread notifications
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {notifications.map((n) => {
                const body = (
                  <div className="px-3 py-2.5 hover:bg-zinc-800/60">
                    <div className="text-sm font-medium text-zinc-200">
                      {n.title}
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5 line-clamp-2">
                      {n.message}
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                );

                return (
                  <li key={n.id}>
                    {n.report ? (
                      <Link
                        href={`/reports/${n.report}`}
                        onClick={() => {
                          markRead(n);
                          setOpen(false);
                        }}
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => markRead(n)}
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
