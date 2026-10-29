// frontend/src/services/chatService.ts
import { apiClient, mockDelay, USE_MOCKS } from "./apiClient";
import { ChatMessage, ChatThread } from "@/types";

let mockThreads: ChatThread[] = [
  {
    assignmentId: "ca_demo_1",
    status: "ACTIVE",
    specialty: "Cardiology",
    clinic: { id: "clinic_001", name: "Meridian Family Health", phone: "+1 (555) 019-2231" },
    patient: { id: "pat_001", name: "Marcus Bell", email: "marcus.bell@example.com" },
    doctor: { id: "doc_001", name: "Dr. Elena Ruiz", email: "e.ruiz@meridianhealth.example" },
    lastMessage: {
      content: "Hi Marcus, how have your morning BP readings felt after adjusting the dosage?",
      senderId: "doc_001",
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
    assignedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
];

let mockMessages: Record<string, ChatMessage[]> = {
  ca_demo_1: [
    {
      id: "msg_1",
      assignmentId: "ca_demo_1",
      senderId: "doc_001",
      senderName: "Dr. Elena Ruiz",
      senderRole: "doctor",
      content: "Hello Marcus, I noticed your blood pressure was elevated on Tuesday. Please ensure you take your reading after resting for 5 minutes.",
      read: true,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: "msg_2",
      assignmentId: "ca_demo_1",
      senderId: "pat_001",
      senderName: "Marcus Bell",
      senderRole: "patient",
      content: "Thanks Dr. Ruiz. I was slightly rushed that morning. The next day was 128/82.",
      read: true,
      createdAt: new Date(Date.now() - 43200000).toISOString(),
    },
    {
      id: "msg_3",
      assignmentId: "ca_demo_1",
      senderId: "doc_001",
      senderName: "Dr. Elena Ruiz",
      senderRole: "doctor",
      content: "Hi Marcus, how have your morning BP readings felt after adjusting the dosage?",
      read: false,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
  ],
};

export const chatService = {
  async getThreads(): Promise<ChatThread[]> {
    if (USE_MOCKS) {
      return mockDelay([...mockThreads]);
    }
    return apiClient.get<ChatThread[]>("/chat/assignments");
  },

  async getMessages(assignmentId: string): Promise<{
    assignment: {
      id: string;
      status: string;
      specialty: string;
      clinic: { name: string } | null;
      patientName: string;
      doctorName: string;
      isEnded: boolean;
    };
    messages: ChatMessage[];
  }> {
    if (USE_MOCKS) {
      const thread = mockThreads.find((t) => t.assignmentId === assignmentId) || mockThreads[0];
      const list = mockMessages[assignmentId] || [];
      return mockDelay({
        assignment: {
          id: thread.assignmentId,
          status: thread.status,
          specialty: thread.specialty,
          clinic: thread.clinic ? { name: thread.clinic.name } : null,
          patientName: thread.patient.name,
          doctorName: thread.doctor.name,
          isEnded: thread.status !== "ACTIVE",
        },
        messages: [...list],
      });
    }
    return apiClient.get<any>(`/chat/assignments/${assignmentId}/messages`);
  },

  async sendMessage(assignmentId: string, content: string): Promise<ChatMessage> {
    if (USE_MOCKS) {
      const newMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        assignmentId,
        senderId: "current_user",
        senderName: "You",
        senderRole: "patient",
        content,
        read: false,
        createdAt: new Date().toISOString(),
      };
      if (!mockMessages[assignmentId]) mockMessages[assignmentId] = [];
      mockMessages[assignmentId].push(newMsg);
      return mockDelay(newMsg, 200);
    }
    return apiClient.post<ChatMessage>(`/chat/assignments/${assignmentId}/messages`, { content });
  },
};

