// frontend/src/services/notificationsService.ts
import { apiClient, mockDelay, USE_MOCKS } from "./apiClient";
import { AppNotification } from "@/types";

let mockNotificationList: AppNotification[] = [
  {
    id: "notif_1",
    userId: "pat_001",
    title: "Vitals Check-in",
    message: "Remember to log your blood pressure reading for today.",
    type: "SYSTEM",
    read: false,
    link: "/patient/log-vitals",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "notif_2",
    userId: "pat_001",
    title: "Weekly Health Summary Ready",
    message: "Your new AI clinical trend analysis is ready to view.",
    type: "SYSTEM",
    read: true,
    link: "/patient/insights",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

export const notificationsService = {
  async getNotifications(limit = 50): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
    if (USE_MOCKS) {
      const unreadCount = mockNotificationList.filter((n) => !n.read).length;
      return mockDelay({
        notifications: [...mockNotificationList],
        unreadCount,
      });
    }
    return apiClient.get<{ notifications: AppNotification[]; unreadCount: number }>(`/notifications?limit=${limit}`);
  },

  async markAsRead(notificationId: string): Promise<AppNotification> {
    if (USE_MOCKS) {
      const n = mockNotificationList.find((x) => x.id === notificationId);
      if (n) n.read = true;
      return mockDelay(n || mockNotificationList[0]);
    }
    return apiClient.patch<AppNotification>(`/notifications/${notificationId}/read`);
  },

  async markAllAsRead(): Promise<{ success: boolean }> {
    if (USE_MOCKS) {
      mockNotificationList.forEach((n) => (n.read = true));
      return mockDelay({ success: true });
    }
    return apiClient.post<{ success: boolean }>("/notifications/read-all");
  },
};

