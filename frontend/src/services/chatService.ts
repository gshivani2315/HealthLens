// frontend/src/services/chatService.ts
//
//   GET  /chat/assignments                          -> ChatThread[]
//   GET  /chat/assignments/:id/messages             -> { assignment, messages: ChatMessage[] }
//   POST /chat/assignments/:id/messages {content}   -> ChatMessage
//   GET  /chat/unread-count                         -> { count }

import { apiClient, mockDelay, USE_MOCKS } from "./apiClient";
import { ChatMessage, ChatThread } from "@/types";

const mockThread: ChatThread = {
  assignmentId: "ca_mock_1",
  status: "ACTIVE",
  specialty: "Primary Care",
  clinic: { id: "clinic_001", name: "Meridian Family Health" },
  patient: { id: "pat_001", name: "Marcus Bell" },
  doctor: { id: "doc_001", name: "Dr. Elena Ruiz" },
  lastMessage: null,
} as ChatThread;
let mockMessages: ChatMessage[] = [];

export const chatService = {
  async getThreads(): Promise<ChatThread[]> {
    if (USE_MOCKS) return mockDelay([mockThread]);
    return apiClient.get<ChatThread[]>("/chat/assignments");
  },

  async getMessages(assignmentId: string): Promise<{ messages: ChatMessage[] }> {
    if (USE_MOCKS) return mockDelay({ messages: [...mockMessages] });
    return apiClient.get<{ messages: ChatMessage[] }>(`/chat/assignments/${assignmentId}/messages`);
  },

  async sendMessage(assignmentId: string, content: string): Promise<ChatMessage> {
    if (USE_MOCKS) {
      const msg = {
        id: `msg_${Date.now()}`,
        assignmentId,
        senderId: "pat_001",
        senderName: "Marcus Bell",
        senderRole: "patient",
        content,
        read: false,
        createdAt: new Date().toISOString(),
      } as ChatMessage;
      mockMessages = [...mockMessages, msg];
      return mockDelay(msg, 200);
    }
    return apiClient.post<ChatMessage>(`/chat/assignments/${assignmentId}/messages`, { content });
  },

  async getUnreadCount(): Promise<number> {
    if (USE_MOCKS) return mockDelay(0);
    const res = await apiClient.get<{ count: number }>("/chat/unread-count");
    return res.count;
  },
};