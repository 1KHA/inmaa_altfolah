"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  actionUrl?: string | null;
  emailStatus?: string | null; // null = no email attempted, 'sent' | 'failed'
  createdAt: string;
}

const PAGE_SIZE = 20;

function getTypeIcon(type: string) {
  switch (type) {
    case "success":
      return "✅";
    case "warning":
      return "⚠️";
    case "error":
      return "❌";
    default:
      return "ℹ️";
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case "success":
      return "text-green-600";
    case "warning":
      return "text-yellow-600";
    case "error":
      return "text-red-600";
    default:
      return "text-blue-600";
  }
}

export default function NotificationsList() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (unreadOnly) params.set("isRead", "false");

      const response = await fetch(`/api/notifications?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("تعذر تحميل الإشعارات");
      }

      const data = await response.json();
      setNotifications(data.notifications || []);
      setTotal(data.total || 0);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [page, unreadOnly]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notificationId }),
      });

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
        // The unread-only view is now empty, so refetch to reflect that
        if (unreadOnly) fetchNotifications();
      }
    } catch (err) {
      console.error("Error marking all notifications as read:", err);
    }
  };

  const handleClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleUnreadOnly = (next: boolean) => {
    setUnreadOnly(next);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold">الإشعارات</h1>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllAsRead}>
            <CheckCheck className="ml-2 h-4 w-4" />
            تعليم الكل كمقروء
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {unreadCount > 0
              ? `لديك ${unreadCount} إشعار غير مقروء`
              : "لا توجد إشعارات غير مقروءة"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-6">
            <Button
              variant={unreadOnly ? "outline" : "default"}
              size="sm"
              onClick={() => toggleUnreadOnly(false)}
            >
              الكل
            </Button>
            <Button
              variant={unreadOnly ? "default" : "outline"}
              size="sm"
              onClick={() => toggleUnreadOnly(true)}
            >
              غير المقروءة
            </Button>
          </div>

          {loading ? (
            <p className="text-center p-4">جاري تحميل البيانات...</p>
          ) : error ? (
            <p className="text-center p-4 text-red-500">{error}</p>
          ) : notifications.length > 0 ? (
            <div className="divide-y rounded-md border">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleClick(notification)}
                  className={`flex items-start gap-3 p-4 cursor-pointer transition-colors ${
                    !notification.isRead
                      ? "bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-950/50"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <span className="text-base mt-0.5">{getTypeIcon(notification.type)}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`text-sm font-medium ${getTypeColor(notification.type)}`}>
                        {notification.title}
                      </h4>
                      {!notification.isRead && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mb-1">{notification.message}</p>

                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>
                        {formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                          locale: ar,
                        })}
                      </span>
                      {notification.emailStatus === "sent" && (
                        <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                          ✉ تم إرسال بريد
                        </span>
                      )}
                      {notification.emailStatus === "failed" && (
                        <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                          ✉ فشل إرسال البريد
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center p-4">
              {unreadOnly ? "لا توجد إشعارات غير مقروءة." : "لا توجد إشعارات لعرضها."}
            </p>
          )}

          {!loading && !error && total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {page} من {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                التالي
              </Button>
            </div>
          )}

          {!loading && !error && (
            <div className="mt-4 text-sm text-muted-foreground text-center">
              إجمالي الإشعارات: {total}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
