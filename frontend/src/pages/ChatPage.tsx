import { FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { chatService } from "@/services/chatService";
import { ChatMessage, ChatThread } from "@/types";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { cx, formatDateTime, timeAgo } from "@/lib/utils";

export default function ChatPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputContent, setInputContent] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  function loadThreads(autoSelectFirst = true) {
    chatService
      .getThreads()
      .then((data) => {
        setThreads(data);
        if (autoSelectFirst && data.length > 0 && !selectedThread) {
          setSelectedThread(data[0]);
        }
      })
      .catch((err) => {
        showToast("Failed to load chat conversations", "error");
      })
      .finally(() => setLoadingThreads(false));
  }

  useEffect(() => {
    loadThreads(true);
  }, []);

  function loadMessages(assignmentId: string) {
    setLoadingMessages(true);
    chatService
      .getMessages(assignmentId)
      .then((res) => {
        setMessages(res.messages);
      })
      .catch((err) => {
        showToast("Failed to load message history", "error");
      })
      .finally(() => setLoadingMessages(false));
  }

  useEffect(() => {
    if (selectedThread) {
      loadMessages(selectedThread.assignmentId);
      const interval = setInterval(() => {
        chatService
          .getMessages(selectedThread.assignmentId)
          .then((res) => setMessages(res.messages))
          .catch(() => {});
      }, 5000); // 5s poll for active chat
      return () => clearInterval(interval);
    }
  }, [selectedThread?.assignmentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault();
    if (!selectedThread || !inputContent.trim()) return;

    if (selectedThread.status !== "ACTIVE") {
      showToast("This care assignment has ended. Messaging is closed.", "error");
      return;
    }

    setSending(true);
    try {
      const newMsg = await chatService.sendMessage(selectedThread.assignmentId, inputContent.trim());
      setMessages((prev) => [...prev, newMsg]);
      setInputContent("");
      // Update thread lastMessage locally
      setThreads((prev) =>
        prev.map((t) =>
          t.assignmentId === selectedThread.assignmentId
            ? { ...t, lastMessage: { content: newMsg.content, senderId: newMsg.senderId, createdAt: newMsg.createdAt } }
            : t
        )
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to send message", "error");
    } finally {
      setSending(false);
    }
  }

  if (loadingThreads) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const isDoctor = user?.role === "doctor";

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header>
        <h1 className="font-sans text-2xl font-bold tracking-tight text-ink">Clinical Messaging</h1>
        <p className="mt-1 text-xs text-ink-500">
          Secure, direct doctor–patient communication scoped to active care assignments.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-230px)] min-h-[550px]">
        {/* Thread List Sidebar */}
        <div className="lg:col-span-4 rounded-xl border border-line bg-white shadow-sm flex flex-col overflow-hidden">
          <div className="p-3.5 border-b border-line bg-ink-50/50">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-500">
              {isDoctor ? "Patient Threads" : "Care Team Physicians"}
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-line/60">
            {threads.length === 0 ? (
              <div className="p-6 text-center text-xs text-ink-400">
                No care assignments found. Once an active assignment is established, messaging will appear here.
              </div>
            ) : (
              threads.map((t) => {
                const isSelected = selectedThread?.assignmentId === t.assignmentId;
                const contactName = isDoctor ? t.patient.name : t.doctor.name;
                const isEnded = t.status !== "ACTIVE";

                return (
                  <button
                    key={t.assignmentId}
                    onClick={() => setSelectedThread(t)}
                    className={cx(
                      "w-full text-left p-3.5 transition-all flex flex-col gap-1 hover:bg-ink-50/70",
                      isSelected ? "bg-teal-50/60 border-l-4 border-teal-600 pl-2.5" : "pl-3.5"
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-sm text-ink truncate">{contactName}</span>
                      {isEnded ? (
                        <span className="rounded bg-brick-50 px-1.5 py-0.5 text-[10px] font-semibold text-brick-600">
                          Ended
                        </span>
                      ) : (
                        <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
                      <span>{t.specialty}</span>
                      {t.clinic?.name && <span>• {t.clinic.name}</span>}
                    </div>
                    {t.lastMessage && (
                      <p className="text-xs text-ink-400 truncate mt-1">{t.lastMessage.content}</p>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Message Thread Area */}
        <div className="lg:col-span-8 rounded-xl border border-line bg-white shadow-sm flex flex-col overflow-hidden">
          {selectedThread ? (
            <>
              {/* Thread Header */}
              <div className="p-3.5 border-b border-line flex items-center justify-between bg-ink-50/30">
                <div>
                  <h3 className="text-sm font-bold text-ink">
                    {isDoctor ? selectedThread.patient.name : selectedThread.doctor.name}
                  </h3>
                  <p className="text-xs text-ink-500">
                    {selectedThread.specialty} • {selectedThread.clinic?.name || "HealthLens Care"}
                  </p>
                </div>
                {selectedThread.status !== "ACTIVE" && (
                  <span className="rounded-md border border-brick-200 bg-brick-50 px-2.5 py-1 text-xs font-semibold text-brick-700">
                    Assignment Ended — Read-only
                  </span>
                )}
              </div>

              {/* Message History */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f8faf8]/40">
                {loadingMessages ? (
                  <div className="flex h-32 items-center justify-center">
                    <Spinner />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-xs text-ink-400 py-12">
                    No messages yet in this thread. Send a greeting to start your conversation.
                  </p>
                ) : (
                  messages.map((m) => {
                    const isSelf = m.senderId === user?.id || (m.senderRole === (user?.role || ""));

                    return (
                      <div
                        key={m.id}
                        className={cx("flex flex-col max-w-[78%]", isSelf ? "ml-auto items-end" : "mr-auto items-start")}
                      >
                        <span className="text-[10px] text-ink-400 mb-0.5 px-1">
                          {m.senderName} • {formatDateTime(m.createdAt)}
                        </span>
                        <div
                          className={cx(
                            "rounded-2xl px-3.5 py-2 text-sm shadow-sm leading-relaxed",
                            isSelf
                              ? "bg-teal-700 text-white rounded-tr-none"
                              : "bg-white text-ink border border-line rounded-tl-none"
                          )}
                        >
                          {m.content}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Box */}
              {selectedThread.status === "ACTIVE" ? (
                <form onSubmit={handleSendMessage} className="p-3 border-t border-line flex items-center gap-2 bg-white">
                  <input
                    type="text"
                    value={inputContent}
                    onChange={(e) => setInputContent(e.target.value)}
                    placeholder="Type a clinical message..."
                    className="flex-1 rounded-xl border border-line px-3.5 py-2.5 text-sm text-ink focus:border-teal-400 focus:outline-none"
                  />
                  <Button type="submit" isLoading={sending} disabled={!inputContent.trim()}>
                    Send
                  </Button>
                </form>
              ) : (
                <div className="p-3 border-t border-line bg-ink-50/70 text-center text-xs text-ink-500 font-medium">
                  This care assignment has ended. Messaging access is closed.
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-ink-400 p-8">
              Select a conversation thread from the left panel to view messages.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

