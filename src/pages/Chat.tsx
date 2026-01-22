import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Phone,
  MessageCircle,
  Video,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Clock,
  ChevronRight,
  Send,
  Paperclip,
  Image as ImageIcon,
  Smile,
  MoreVertical,
  ArrowLeft,
  FileText,
  Star,
  MapPin,
  CheckCheck,
  Check,
  Mic,
  Camera,
} from "lucide-react";
import { useUserRole } from "@/contexts/UserRoleContext";

// Mock call history data
const mockCallHistory = [
  {
    id: "call1",
    contactName: "Premium Textile Mills",
    contactAvatar: "PTM",
    contactImage: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100",
    type: "outgoing" as const,
    duration: "12:34",
    timestamp: "Today, 10:30 AM",
    rfqId: "RFQ001",
    rfqProduct: "Organic Cotton Fabric",
    missed: false,
  },
  {
    id: "call2",
    contactName: "Silk Weavers Co.",
    contactAvatar: "SWC",
    contactImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100",
    type: "incoming" as const,
    duration: "8:15",
    timestamp: "Today, 9:15 AM",
    rfqId: "RFQ002",
    rfqProduct: "Pure Silk Fabric",
    missed: false,
  },
  {
    id: "call3",
    contactName: "Denim Factory Ltd",
    contactAvatar: "DFL",
    contactImage: null,
    type: "missed" as const,
    duration: "",
    timestamp: "Yesterday, 4:45 PM",
    rfqId: "RFQ003",
    rfqProduct: "Stretch Denim",
    missed: true,
  },
  {
    id: "call4",
    contactName: "Linen House",
    contactAvatar: "LH",
    contactImage: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100",
    type: "outgoing" as const,
    duration: "25:10",
    timestamp: "Yesterday, 2:30 PM",
    rfqId: "RFQ001",
    rfqProduct: "Premium Linen Fabric",
    missed: false,
  },
  {
    id: "call5",
    contactName: "Eco Fabrics Inc",
    contactAvatar: "EFI",
    contactImage: null,
    type: "incoming" as const,
    duration: "5:42",
    timestamp: "Jan 18, 11:20 AM",
    rfqId: "RFQ004",
    rfqProduct: "Recycled Polyester",
    missed: false,
  },
];

// Mock chat conversations data
const mockConversations = [
  {
    id: "conv1",
    contactName: "Premium Textile Mills",
    contactAvatar: "PTM",
    contactImage: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100",
    lastMessage: "We can offer 10% discount for orders above 10,000 meters.",
    timestamp: "10:35 AM",
    unread: 2,
    online: true,
    rfqId: "RFQ001",
    rfqProduct: "Organic Cotton Fabric",
    verified: true,
    rating: 4.8,
    location: "Mumbai, India",
    messages: [
      { id: "m1", sender: "vendor", text: "Hello! Thank you for your interest in our products.", time: "10:30 AM", status: "read" },
      { id: "m2", sender: "user", text: "Hi, I wanted to discuss the pricing for bulk orders.", time: "10:32 AM", status: "read" },
      { id: "m3", sender: "vendor", text: "Of course! We can offer 10% discount for orders above 10,000 meters.", time: "10:35 AM", status: "read" },
    ],
  },
  {
    id: "conv2",
    contactName: "Silk Weavers Co.",
    contactAvatar: "SWC",
    contactImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100",
    lastMessage: "The samples have been shipped. You should receive them by Friday.",
    timestamp: "9:20 AM",
    unread: 0,
    online: true,
    rfqId: "RFQ002",
    rfqProduct: "Pure Silk Fabric",
    verified: true,
    rating: 4.9,
    location: "Bangalore, India",
    messages: [
      { id: "m1", sender: "user", text: "When can you ship the samples?", time: "Yesterday", status: "read" },
      { id: "m2", sender: "vendor", text: "The samples have been shipped. You should receive them by Friday.", time: "9:20 AM", status: "read" },
    ],
  },
  {
    id: "conv3",
    contactName: "Denim Factory Ltd",
    contactAvatar: "DFL",
    contactImage: null,
    lastMessage: "Could you please share more details about the specifications?",
    timestamp: "Yesterday",
    unread: 1,
    online: false,
    rfqId: "RFQ003",
    rfqProduct: "Stretch Denim",
    verified: false,
    rating: 4.5,
    location: "Ahmedabad, India",
    messages: [
      { id: "m1", sender: "vendor", text: "Hi! We received your quote request.", time: "Yesterday", status: "read" },
      { id: "m2", sender: "vendor", text: "Could you please share more details about the specifications?", time: "Yesterday", status: "delivered" },
    ],
  },
  {
    id: "conv4",
    contactName: "Linen House",
    contactAvatar: "LH",
    contactImage: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100",
    lastMessage: "Perfect! I'll prepare the invoice shortly.",
    timestamp: "Jan 19",
    unread: 0,
    online: false,
    rfqId: "RFQ001",
    rfqProduct: "Premium Linen Fabric",
    verified: true,
    rating: 4.7,
    location: "Delhi, India",
    messages: [
      { id: "m1", sender: "user", text: "I'd like to proceed with the order.", time: "Jan 19", status: "read" },
      { id: "m2", sender: "vendor", text: "Perfect! I'll prepare the invoice shortly.", time: "Jan 19", status: "read" },
    ],
  },
];

const Chat = () => {
  const navigate = useNavigate();
  const { role } = useUserRole();
  const [activeTab, setActiveTab] = useState("chats");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<typeof mockConversations[0] | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [messages, setMessages] = useState<typeof mockConversations[0]["messages"]>([]);

  const handleSelectConversation = (conv: typeof mockConversations[0]) => {
    setSelectedConversation(conv);
    setMessages(conv.messages);
  };

  const handleSendMessage = () => {
    if (newMessage.trim() && selectedConversation) {
      const newMsg = {
        id: `m${messages.length + 1}`,
        sender: "user" as const,
        text: newMessage,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: "sent" as const,
      };
      setMessages([...messages, newMsg]);
      setNewMessage("");
      toast.success("Message sent!");
    }
  };

  const handleCallBack = (call: typeof mockCallHistory[0]) => {
    toast.success(`Calling ${call.contactName}...`);
  };

  const handleViewRFQ = (rfqId: string) => {
    navigate("/quotes");
  };

  const getCallIcon = (type: string, missed: boolean) => {
    if (missed) return <PhoneMissed className="h-4 w-4 text-destructive" />;
    if (type === "incoming") return <PhoneIncoming className="h-4 w-4 text-emerald-500" />;
    return <PhoneOutgoing className="h-4 w-4 text-accent" />;
  };

  const filteredConversations = mockConversations.filter(conv =>
    conv.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.rfqProduct.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCalls = mockCallHistory.filter(call =>
    call.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    call.rfqProduct.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUnread = mockConversations.reduce((sum, conv) => sum + conv.unread, 0);

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-7rem)] lg:h-[calc(100vh-5rem)] flex-col lg:flex-row gap-4 p-2 lg:p-4">
        {/* Conversations/Calls List */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className={`w-full lg:w-96 flex-shrink-0 ${selectedConversation ? 'hidden lg:flex' : 'flex'} flex-col`}
        >
          <Card className="flex-1 flex flex-col overflow-hidden border-border/50 bg-card">
            {/* Header with Tabs */}
            <CardHeader className="border-b border-border/50 pb-3 pt-4 px-4">
              <div className="flex items-center justify-between mb-3">
                <CardTitle className="font-display text-xl">Messages</CardTitle>
                {totalUnread > 0 && (
                  <Badge variant="default" className="bg-accent text-accent-foreground">
                    {totalUnread} new
                  </Badge>
                )}
              </div>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-muted/50">
                  <TabsTrigger value="chats" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
                    <MessageCircle size={16} />
                    <span className="hidden sm:inline">Chats</span>
                    {totalUnread > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
                        {totalUnread}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="calls" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
                    <Phone size={16} />
                    <span className="hidden sm:inline">Calls</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>

            {/* Search */}
            <div className="p-3 border-b border-border/30">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-muted/30 border-0 focus-visible:ring-1"
                />
              </div>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
              <AnimatePresence mode="wait">
                {activeTab === "chats" ? (
                  <motion.div
                    key="chats"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-2"
                  >
                    {filteredConversations.map((conv, index) => (
                      <motion.div
                        key={conv.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={() => handleSelectConversation(conv)}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 mb-1 ${
                          selectedConversation?.id === conv.id
                            ? 'bg-accent/10 border border-accent/30'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="relative">
                          <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                            {conv.contactImage ? (
                              <AvatarImage src={conv.contactImage} />
                            ) : null}
                            <AvatarFallback className="bg-gradient-to-br from-accent/20 to-accent/40 text-foreground font-semibold">
                              {conv.contactAvatar}
                            </AvatarFallback>
                          </Avatar>
                          {conv.online && (
                            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-accent border-2 border-background" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-sm text-foreground truncate">
                                {conv.contactName}
                              </span>
                              {conv.verified && (
                                <Badge variant="outline" className="h-4 px-1 text-[10px] border-accent/50 text-accent">
                                  ✓
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {conv.timestamp}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-muted/70">
                              {conv.rfqProduct}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground truncate pr-2">
                              {conv.lastMessage}
                            </p>
                            {conv.unread > 0 && (
                              <Badge className="h-5 w-5 rounded-full p-0 text-xs bg-accent text-accent-foreground flex-shrink-0">
                                {conv.unread}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key="calls"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-2"
                  >
                    {filteredCalls.map((call, index) => (
                      <motion.div
                        key={call.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-all duration-200 mb-1"
                      >
                        <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                          {call.contactImage ? (
                            <AvatarImage src={call.contactImage} />
                          ) : null}
                          <AvatarFallback className="bg-gradient-to-br from-accent/20 to-accent/40 text-foreground font-semibold">
                            {call.contactAvatar}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`font-semibold text-sm ${call.missed ? 'text-destructive' : 'text-foreground'}`}>
                              {call.contactName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {call.timestamp}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-muted/70">
                              {call.rfqProduct}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {getCallIcon(call.type, call.missed)}
                              <span className="capitalize">{call.type}</span>
                              {call.duration && (
                                <>
                                  <span>•</span>
                                  <span>{call.duration}</span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 hover:bg-accent/10"
                                onClick={() => handleCallBack(call)}
                              >
                                <PhoneCall className="h-4 w-4 text-accent" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 hover:bg-muted"
                                onClick={() => handleViewRFQ(call.rfqId)}
                              >
                                <FileText className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </Card>
        </motion.div>

        {/* Chat Area */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className={`flex-1 ${!selectedConversation ? 'hidden lg:flex' : 'flex'} flex-col`}
        >
          {selectedConversation ? (
            <Card className="flex-1 flex flex-col overflow-hidden border-border/50 bg-card">
              {/* Chat Header */}
              <div className="flex items-center gap-3 p-4 border-b border-border/50 bg-gradient-to-r from-card to-muted/30">
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden h-8 w-8 p-0"
                  onClick={() => setSelectedConversation(null)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="relative">
                  <Avatar className="h-11 w-11 border-2 border-background shadow-md">
                    {selectedConversation.contactImage ? (
                      <AvatarImage src={selectedConversation.contactImage} />
                    ) : null}
                    <AvatarFallback className="bg-gradient-to-br from-accent/20 to-accent/40 text-foreground font-semibold">
                      {selectedConversation.contactAvatar}
                    </AvatarFallback>
                  </Avatar>
                  {selectedConversation.online && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-accent border-2 border-background" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground truncate">
                      {selectedConversation.contactName}
                    </h3>
                    {selectedConversation.verified && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-accent/50 text-accent">
                        Verified
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={selectedConversation.online ? "text-emerald-500" : ""}>
                      {selectedConversation.online ? "Online" : "Offline"}
                    </span>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-accent fill-accent" />
                      {selectedConversation.rating}
                    </div>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedConversation.location}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 hover:bg-accent/10 rounded-full"
                    onClick={() => toast.success(`Calling ${selectedConversation.contactName}...`)}
                  >
                    <Phone className="h-4 w-4 text-accent" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 hover:bg-accent/10 rounded-full"
                    onClick={() => toast.success("Starting video call...")}
                  >
                    <Video className="h-4 w-4 text-accent" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 hover:bg-muted rounded-full"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* RFQ Link Banner */}
              <div
                onClick={() => handleViewRFQ(selectedConversation.rfqId)}
                className="flex items-center justify-between px-4 py-2.5 bg-accent/5 border-b border-accent/20 cursor-pointer hover:bg-accent/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium text-foreground">
                    Related RFQ: {selectedConversation.rfqProduct}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-accent" />
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map((msg, index) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] lg:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${
                          msg.sender === 'user'
                            ? 'bg-accent text-accent-foreground rounded-br-md'
                            : 'bg-muted rounded-bl-md'
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                        <div className={`flex items-center gap-1 mt-1 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                          <span className={`text-[10px] ${msg.sender === 'user' ? 'text-accent-foreground/70' : 'text-muted-foreground'}`}>
                            {msg.time}
                          </span>
                          {msg.sender === 'user' && (
                            msg.status === 'read' ? (
                              <CheckCheck className="h-3 w-3 text-accent-foreground/70" />
                            ) : (
                              <Check className="h-3 w-3 text-accent-foreground/70" />
                            )
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>

              {/* Message Input */}
              <div className="p-3 border-t border-border/50 bg-card">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 p-0 rounded-full hover:bg-muted"
                    >
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 p-0 rounded-full hover:bg-muted hidden sm:flex"
                    >
                      <Camera className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="flex-1 relative">
                    <Input
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="pr-10 rounded-full bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-accent"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 rounded-full hover:bg-transparent"
                    >
                      <Smile className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  {newMessage.trim() ? (
                    <Button
                      size="sm"
                      className="h-10 w-10 p-0 rounded-full bg-accent hover:bg-accent/90"
                      onClick={handleSendMessage}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-10 w-10 p-0 rounded-full hover:bg-accent/10"
                    >
                      <Mic className="h-4 w-4 text-accent" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ) : (
            <Card className="flex-1 flex items-center justify-center border-border/50 bg-card">
              <div className="text-center p-8">
                <div className="mx-auto h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                  <MessageCircle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                  Select a conversation
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Choose a conversation from the list to start messaging with vendors about your RFQs
                </p>
              </div>
            </Card>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default Chat;
