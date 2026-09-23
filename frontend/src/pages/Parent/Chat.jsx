import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { chatsApi } from '../../api/chats';
import { LuMessageSquare as MessageSquare, LuFile as FileIcon, LuDownload as DownloadIcon, LuX as XIcon, LuCopy as Copy, LuForward as Forward, LuBan as Ban } from 'react-icons/lu';
import toast from 'react-hot-toast';
import ChatInput from '../../components/ChatInput';
import CustomAudioPlayer from '../../components/CustomAudioPlayer';

export default function ParentChat() {
  const { userProfile, currentUser } = useAuth();
  const outletContext = useOutletContext();
  const activeStudentIdFromContext = outletContext?.activeStudentId;
  const studentId = activeStudentIdFromContext || userProfile?.linkedStudentId;
  const currentUserId = currentUser?.uid || userProfile?.id || userProfile?.userId;

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [loadingConversations, setLoadingConversations] = useState(true);

  // Channel State
  const [activeTab, setActiveTab] = useState('dms'); // 'dms' | 'channels'
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [loadingChannels, setLoadingChannels] = useState(true);

  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef(null);
  const [previewFile, setPreviewFile] = useState(null); // { url, type }

  const mountedRef = useRef(true);
  const currentStudentRef = useRef(studentId);

  const handleDownload = async (url, customName = 'file') => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      
      let fileName = customName;
      try {
        const decoded = decodeURIComponent(url.split('/').pop().split('?')[0]);
        if (decoded && decoded.includes('.')) {
          fileName = decoded;
        }
      } catch (e) {
        console.warn(e);
      }
      
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Error downloading file:", err);
      window.open(url, '_blank');
    }
  };

  // Fetch Rooms & Conversations for the active student
  const fetchConversations = useCallback(async (targetStudentId) => {
    if (!targetStudentId) {
      setConversations([]);
      setActiveConversation(null);
      setLoadingConversations(false);
      return;
    }

    setLoadingConversations(true);
    try {
      const res = await chatsApi.listChatRooms();
      if (!mountedRef.current || currentStudentRef.current !== targetStudentId) return;

      const allRooms = Array.isArray(res?.data) ? res.data : [];
      let studentRooms = allRooms.filter(r => r.studentId === targetStudentId);

      // If no room exists yet, attempt auto-resolution with class teacher
      if (studentRooms.length === 0) {
        try {
          const resolved = await chatsApi.resolveChatRoom({ studentId: targetStudentId });
          if (resolved?.id) {
            studentRooms = [resolved];
          }
        } catch {
          // Class teacher may not be assigned yet; room list will be empty
        }
      }

      if (!mountedRef.current || currentStudentRef.current !== targetStudentId) return;

      const formatted = studentRooms.map(room => ({
        id: room.id,
        roomId: room.id,
        teacherId: room.teacherId,
        teacherName: room.teacherName || 'Teacher',
        teacherEmail: room.teacherEmail,
        teacherPhone: room.teacherPhone,
        role: 'Teacher',
        unreadCount: room.unreadCountParent ?? room.unreadCount_parent ?? 0,
        otherUnreadCount: room.unreadCountTeacher ?? room.unreadCount_teacher ?? 0,
        lastMessage: room.lastMessage,
        lastMessageTime: room.lastMessageTime,
        studentId: room.studentId,
        studentName: room.studentName,
        rawRoom: room
      }));

      // Sort by lastMessageTime descending, then by name
      formatted.sort((a, b) => {
        if (a.lastMessageTime && b.lastMessageTime) {
          return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
        }
        if (a.lastMessageTime) return -1;
        if (b.lastMessageTime) return 1;
        return (a.teacherName || '').localeCompare(b.teacherName || '');
      });

      setConversations(formatted);

      setActiveConversation(prev => {
        if (prev && formatted.some(c => c.roomId === prev.roomId)) {
          return formatted.find(c => c.roomId === prev.roomId);
        }
        return formatted.length > 0 ? formatted[0] : null;
      });
    } catch (err) {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        console.error("Error fetching conversations:", err);
        toast.error(err?.message || "Failed to load conversations");
        setConversations([]);
        setActiveConversation(null);
      }
    } finally {
      if (mountedRef.current && currentStudentRef.current === targetStudentId) {
        setLoadingConversations(false);
      }
    }
  }, []);

  // Fetch Channels
  const fetchChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      const res = await chatsApi.listChatChannels();
      if (!mountedRef.current) return;
      setChannels(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      if (mountedRef.current) {
        console.error("Error fetching broadcast channels:", err);
        setChannels([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoadingChannels(false);
      }
    }
  }, []);

  // Synchronize student lifecycle and clear stale state
  useEffect(() => {
    mountedRef.current = true;
    currentStudentRef.current = studentId;

    // Reset conversation and messages state to prevent stale data cross-leak
    setMessages([]);
    setActiveConversation(null);
    setActiveChannel(null);

    fetchConversations(studentId);
    fetchChannels();

    return () => {
      mountedRef.current = false;
    };
  }, [studentId, fetchConversations, fetchChannels]);

  // Load messages for the active conversation
  const loadRoomMessages = useCallback(async (roomId) => {
    if (!roomId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    try {
      const res = await chatsApi.listChatMessages(roomId);
      if (!mountedRef.current) return;
      const msgs = Array.isArray(res?.data) ? res.data : [];
      setMessages(msgs);

      // Mark room read
      try {
        await chatsApi.markChatRoomRead(roomId);
        setConversations(prev => prev.map(c => c.roomId === roomId ? { ...c, unreadCount: 0 } : c));
      } catch (markErr) {
        console.warn("Failed to mark chat as read:", markErr);
      }
    } catch (err) {
      if (mountedRef.current) {
        console.error("Error loading chat messages:", err);
        toast.error(err?.message || "Failed to load messages");
        setMessages([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoadingMessages(false);
      }
    }
  }, []);

  // Load channel posts for active channel
  const loadChannelPosts = useCallback(async (channelId) => {
    if (!channelId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    try {
      const res = await chatsApi.listChannelPosts(channelId);
      if (!mountedRef.current) return;
      setMessages(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      if (mountedRef.current) {
        console.error("Error loading channel posts:", err);
        toast.error(err?.message || "Failed to load channel posts");
        setMessages([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoadingMessages(false);
      }
    }
  }, []);

  // Trigger message load when active conversation or channel changes
  useEffect(() => {
    if (activeTab === 'dms') {
      if (activeConversation?.roomId) {
        loadRoomMessages(activeConversation.roomId);
      } else {
        setMessages([]);
      }
    } else if (activeTab === 'channels') {
      if (activeChannel?.id) {
        loadChannelPosts(activeChannel.id);
      } else {
        setMessages([]);
      }
    }
  }, [activeTab, activeConversation?.roomId, activeChannel?.id, loadRoomMessages, loadChannelPosts]);

  // Auto-scroll to bottom on message change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (text, mediaUrl, mediaType) => {
    if (!studentId) return;

    try {
      if (activeTab === 'channels' && activeChannel) {
        toast.error("Channels are read-only.");
        return;
      }

      if (activeTab === 'dms' && activeConversation?.roomId) {
        const payload = {
          text: text?.trim() || null,
          mediaUrl: mediaUrl || null,
          mediaType: mediaType || null
        };

        const createdMsg = await chatsApi.sendChatMessage(activeConversation.roomId, payload);
        if (createdMsg) {
          setMessages(prev => [...prev, createdMsg]);
          // Update last message in conversation list
          const previewText = text || (mediaType ? `[${mediaType}]` : '[Attachment]');
          setConversations(prev => prev.map(c => 
            c.roomId === activeConversation.roomId 
              ? { ...c, lastMessage: previewText, lastMessageTime: new Date().toISOString() } 
              : c
          ));
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error(error?.message || "Failed to send message.");
    }
  };

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Message copied");
  };

  const handleForward = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Message copied to clipboard for forwarding");
  };

  const formatDateSeparator = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    
    return date.toLocaleDateString('en-GB');
  };

  const renderMessageContent = (msg, isMe) => {
    if (msg.isDeletedForEveryone) {
      return (
        <p className="text-sm italic flex items-center gap-1 opacity-70">
          <Ban size={14} /> This message was deleted
        </p>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        {msg.mediaUrl && (
          <div className="mb-1">
            {msg.mediaType === 'image' && (
              <button 
                onClick={() => setPreviewFile({ url: msg.mediaUrl, type: 'image' })} 
                className="focus:outline-none hover:opacity-90 transition-opacity text-left block"
              >
                <img src={msg.mediaUrl} alt="Attachment" className="max-w-full h-auto max-h-48 rounded-lg object-contain bg-black/5 dark:bg-white/5 cursor-zoom-in" />
              </button>
            )}
            {msg.mediaType === 'audio' && (
              <CustomAudioPlayer src={msg.mediaUrl} isMe={isMe} />
            )}
            {msg.mediaType === 'document' && (
              <button 
                onClick={() => setPreviewFile({ url: msg.mediaUrl, type: 'document' })} 
                className="flex items-center gap-2 p-3 bg-black/5 dark:bg-white/5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus:outline-none text-left w-full text-inherit"
              >
                <FileIcon size={20} className="shrink-0" />
                <span className="text-sm font-semibold underline truncate">View Document</span>
              </button>
            )}
          </div>
        )}
        {msg.text && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
      </div>
    );
  };

  if (!studentId) {
    return <div className="p-8 text-center text-slate-500 dark:text-slate-400">Please link a student to use the chat.</div>;
  }

  if (loadingConversations) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-0 sm:p-4 md:p-8 max-w-7xl mx-auto h-[100dvh] md:h-[calc(100vh-2rem)] flex flex-col bg-slate-50 dark:bg-slate-800 md:bg-transparent min-w-0 w-full">
      <div className="mb-4 md:mb-6 shrink-0 p-4 md:p-0 bg-white dark:bg-slate-900 md:bg-transparent border-b border-slate-200 dark:border-slate-700 md:border-transparent min-w-0 w-full">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white truncate">Staff Chat</h1>
        <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 mt-1">Communicate directly with teachers.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-0 md:gap-6 flex-1 min-h-0 bg-white dark:bg-slate-900 md:bg-transparent w-full min-w-0">
        
        {/* Sidebar */}
        <div className={`w-full lg:w-80 flex-col bg-white dark:bg-slate-900 md:border md:border-slate-200 md:rounded-3xl overflow-hidden md:shadow-sm shrink-0 min-w-0 ${
          activeConversation || activeChannel ? 'hidden lg:flex' : 'flex'
        }`}>
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col gap-4">
            <h2 className="font-bold text-slate-700 dark:text-slate-200">Messaging</h2>
            <div className="flex bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
              <button 
                onClick={() => { setActiveTab('dms'); setActiveChannel(null); }}
                className={`flex-1 text-sm font-bold py-1.5 rounded-lg transition-colors ${activeTab === 'dms' ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                Staff DMs
              </button>
              <button 
                onClick={() => { setActiveTab('channels'); setActiveConversation(null); }}
                className={`flex-1 text-sm font-bold py-1.5 rounded-lg transition-colors ${activeTab === 'channels' ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                Channels
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {activeTab === 'dms' ? (
              conversations.length === 0 ? (
                <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-sm">No teachers available.</div>
              ) : (
                conversations.map(conv => (
                  <button
                    key={conv.roomId}
                    onClick={() => setActiveConversation(conv)}
                    className={`w-full text-left p-3 rounded-2xl flex items-center gap-3 transition-colors ${
                      activeConversation?.roomId === conv.roomId 
                        ? 'bg-primary-50 dark:bg-slate-800 border-l-4 border-l-primary-600 border-y-transparent border-r-transparent shadow-sm' 
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4 border-transparent'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                      activeConversation?.roomId === conv.roomId ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}>
                      {(conv.teacherName || 'T').charAt(0).toUpperCase()}
                    </div>
                    <div className="overflow-hidden flex-1">
                      <div className="font-bold text-slate-900 dark:text-white truncate flex items-center justify-between">
                        <span>{conv.teacherName}</span>
                        {conv.unreadCount > 0 && (
                          <span className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate capitalize">{conv.role || 'Teacher'}</div>
                    </div>
                  </button>
                ))
              )
            ) : (
              loadingChannels ? (
                <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-sm">Loading channels...</div>
              ) : channels.length === 0 ? (
                <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-sm">No channels available.</div>
              ) : (
                channels.map(channel => (
                  <button
                    key={channel.id}
                    onClick={() => setActiveChannel(channel)}
                    className={`w-full text-left p-3 rounded-2xl flex items-center gap-3 transition-colors ${
                      activeChannel?.id === channel.id 
                        ? 'bg-primary-50 dark:bg-slate-800 border-l-4 border-l-primary-600 border-y-transparent border-r-transparent shadow-sm' 
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4 border-transparent'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${
                      activeChannel?.id === channel.id ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}>
                      #
                    </div>
                    <div className="overflow-hidden flex-1">
                      <div className="font-bold text-slate-900 dark:text-white truncate flex items-center justify-between">
                        <span>{channel.name}</span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{channel.className ? `Class: ${channel.className}` : 'School Channel'}</div>
                    </div>
                  </button>
                ))
              )
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className={`flex-1 bg-white dark:bg-slate-900 md:rounded-3xl md:border border-slate-200 dark:border-slate-700 md:shadow-sm flex-col min-h-0 overflow-hidden relative ${
          !activeConversation && !activeChannel ? 'hidden lg:flex' : 'flex'
        }`}>
          {activeTab === 'dms' && activeConversation && (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center gap-4 shrink-0">
                <button 
                  onClick={() => setActiveConversation(null)}
                  className="lg:hidden p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-lg shrink-0">
                  {(activeConversation.teacherName || 'T').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 dark:text-white text-lg truncate">
                    {activeConversation.teacherName}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span> Staff
                  </p>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden custom-scrollbar bg-[#f0f2f5] dark:bg-slate-900/50 shadow-inner flex flex-col gap-4 relative">
                {loadingMessages ? (
                  <div className="flex justify-center items-center h-full">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-300 text-center">
                    <MessageSquare size={48} className="mb-4 text-slate-200" />
                    <p>No messages yet.</p>
                    <p className="text-sm">Say hello to start the conversation.</p>
                  </div>
                ) : (
                  (() => {
                    const currentConv = conversations.find(c => c.roomId === activeConversation.roomId);
                    let unreadCounter = currentConv?.otherUnreadCount || 0;
                    const readStatus = {};
                    const visibleMessages = messages;
                    
                    for (let i = visibleMessages.length - 1; i >= 0; i--) {
                      const msg = visibleMessages[i];
                      const isMe = msg.senderRole === 'parent' || msg.senderId === currentUserId;
                      if (isMe) {
                        readStatus[msg.id] = unreadCounter <= 0;
                        unreadCounter--;
                      }
                    }

                    let lastDateString = null;

                    return visibleMessages.map(msg => {
                      const isMe = msg.senderRole === 'parent' || msg.senderId === currentUserId;
                      const msgDate = new Date(msg.createdAt).toDateString();
                      const showDateSeparator = msgDate !== lastDateString;
                      if (showDateSeparator) {
                        lastDateString = msgDate;
                      }

                      return (
                        <React.Fragment key={msg.id}>
                          {showDateSeparator && (
                            <div className="flex justify-center my-4 z-10">
                              <span className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md shadow-sm text-slate-500 dark:text-slate-400 text-[11px] font-bold px-4 py-1.5 rounded-full border border-slate-200/50 dark:border-slate-700/50">
                                {formatDateSeparator(msg.createdAt)}
                              </span>
                            </div>
                          )}
                          <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} group items-center gap-2`}>
                            
                            {/* Message Options (Me) */}
                            {isMe && !msg.isDeletedForEveryone && (
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-10 shrink-0">
                                {msg.text && <button onClick={() => handleCopy(msg.text)} className="p-1.5 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 shadow-sm border border-slate-200 dark:border-slate-700" title="Copy"><Copy size={14}/></button>}
                                {msg.text && <button onClick={() => handleForward(msg.text)} className="p-1.5 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 shadow-sm border border-slate-200 dark:border-slate-700" title="Forward"><Forward size={14}/></button>}
                              </div>
                            )}

                            <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl p-4 ${
                              isMe 
                                ? (msg.isDeletedForEveryone ? 'bg-primary-500 text-white/80 rounded-tr-sm' : 'bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-tr-sm shadow-md shadow-primary-500/20')
                                : (msg.isDeletedForEveryone ? 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-tl-sm shadow-sm' : 'bg-white dark:bg-slate-900 border-0 text-slate-800 dark:text-slate-100 rounded-tl-sm shadow-md shadow-slate-200/50 dark:shadow-none')
                            } relative`}>
                              
                              {renderMessageContent(msg, isMe)}
                              <span className={`text-[10px] mt-1 flex items-center gap-1 ${isMe ? 'text-primary-200 justify-end' : 'text-slate-400 dark:text-slate-300 justify-start'}`}>
                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {isMe && (
                                  <span title={readStatus[msg.id] ? "Seen" : "Sent"} className="font-bold ml-1 tracking-tighter">
                                    {readStatus[msg.id] ? "✓✓" : "✓"}
                                  </span>
                                )}
                              </span>
                            </div>

                            {/* Message Options (Non-Me) */}
                            {!isMe && !msg.isDeletedForEveryone && (
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-10 shrink-0">
                                {msg.text && <button onClick={() => handleCopy(msg.text)} className="p-1.5 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 shadow-sm border border-slate-200 dark:border-slate-700" title="Copy"><Copy size={14}/></button>}
                                {msg.text && <button onClick={() => handleForward(msg.text)} className="p-1.5 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-100 shadow-sm border border-slate-200 dark:border-slate-700" title="Forward"><Forward size={14}/></button>}
                              </div>
                            )}
                          </div>
                        </React.Fragment>
                      );
                    });
                  })()
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <ChatInput 
                chatRoomId={activeConversation.roomId} 
                onSendMessage={handleSendMessage} 
              />
            </>
          )}

          {activeTab === 'dms' && !activeConversation && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-300 p-8 text-center bg-slate-50/50 dark:bg-slate-800/50">
              <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-4">
                <MessageSquare size={32} className="text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">Select a staff member</h3>
              <p className="max-w-xs">Choose a staff member from the sidebar to start a conversation.</p>
            </div>
          )}

          {activeTab === 'channels' && activeChannel && (
            <>
              {/* Channel Header */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setActiveChannel(null)}
                    className="lg:hidden p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  </button>
                  <div className="w-12 h-12 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-lg shrink-0">
                    #
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-slate-900 dark:text-white text-lg truncate">
                      {activeChannel.name}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {activeChannel.className ? `Class: ${activeChannel.className}` : 'School Broadcast Channel'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden custom-scrollbar bg-[#f0f2f5] dark:bg-slate-900/50 shadow-inner flex flex-col gap-4">
                {loadingMessages ? (
                  <div className="flex justify-center items-center h-full">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-300 text-center">
                    <MessageSquare size={48} className="mb-4 text-slate-200" />
                    <p>No messages yet.</p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.senderRole === 'parent' || msg.senderId === currentUserId;
                    const isTeacher = msg.senderRole === 'teacher';
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group relative`}>
                        <div className={`text-xs font-semibold mb-1 ${isTeacher ? 'text-primary-600' : 'text-slate-500 dark:text-slate-400'}`}>
                          {msg.senderName || (isTeacher ? 'Teacher' : 'Staff')}
                        </div>
                        <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl p-4 ${
                          isMe 
                            ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-tr-sm shadow-md shadow-primary-500/20' 
                            : (isTeacher ? 'bg-primary-50 text-slate-900 dark:text-white rounded-tl-sm shadow-sm' : 'bg-white dark:bg-slate-900 border-0 text-slate-800 dark:text-slate-100 rounded-tl-sm shadow-md shadow-slate-200/50 dark:shadow-none')
                        } relative`}>
                          {renderMessageContent(msg, isMe)}
                          
                          <div className={`text-[10px] mt-2 text-right ${isMe ? 'text-primary-100' : 'text-slate-400 dark:text-slate-300'}`}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="shrink-0 bg-white dark:bg-slate-900">
                <div className="p-4 text-center text-slate-500 dark:text-slate-400 text-sm bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 font-medium">
                  Channels are read-only. Announcements appear here.
                </div>
              </div>
            </>
          )}

          {activeTab === 'channels' && !activeChannel && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-300 p-8 text-center bg-slate-50/50 dark:bg-slate-800/50">
              <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-4">
                <MessageSquare size={32} className="text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">Select a channel</h3>
              <p className="max-w-xs">Choose a channel from the sidebar to view announcements.</p>
            </div>
          )}
        </div>
      </div>

      {previewFile && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center z-[9999] p-4 animate-fade-in">
          <div className="absolute top-4 right-4 flex items-center gap-3">
            <button
              onClick={() => handleDownload(previewFile.url)}
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors flex items-center justify-center backdrop-blur-sm"
              title="Download File"
            >
              <DownloadIcon size={22} />
            </button>
            <button
              onClick={() => setPreviewFile(null)}
              className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors flex items-center justify-center backdrop-blur-sm"
              title="Close Preview"
            >
              <XIcon size={22} />
            </button>
          </div>
          <div className="max-w-4xl w-full max-h-[85vh] flex items-center justify-center p-4">
            {previewFile.type === 'image' ? (
              <img
                src={previewFile.url}
                alt="Preview"
                className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-white/10"
              />
            ) : (
              previewFile.url.toLowerCase().includes('.pdf') || previewFile.url.toLowerCase().includes('/raw/upload') ? (
                <iframe 
                  src={previewFile.url} 
                  title="Document Preview"
                  className="w-[85vw] md:w-[70vw] h-[75vh] rounded-2xl border border-white/10 bg-white dark:bg-slate-900 shadow-2xl"
                />
              ) : (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-700 text-center flex flex-col items-center gap-6">
                  <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-3xl flex items-center justify-center shadow-inner">
                    <FileIcon size={40} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white truncate max-w-xs mx-auto">
                      {decodeURIComponent(previewFile.url.split('/').pop().split('?')[0]) || 'Attachment Document'}
                    </h3>
                    <p className="text-sm text-slate-400 dark:text-slate-300 mt-2">Preview is not supported for this file extension.</p>
                  </div>
                  <button
                    onClick={() => handleDownload(previewFile.url)}
                    className="w-full py-3 bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg"
                  >
                    <DownloadIcon size={18} /> Download to View
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
