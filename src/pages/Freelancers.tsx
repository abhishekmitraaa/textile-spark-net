import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search,
  Star,
  MapPin,
  BadgeCheck,
  MessageCircle,
  Users,
  Briefcase,
  Palette,
  Scissors,
  PenTool,
  Camera,
  TrendingUp,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Freelancer expertise categories
const expertiseCategories = [
  { id: "all", label: "All Experts", icon: Users },
  { id: "designer", label: "Fashion Designers", icon: PenTool },
  { id: "pattern", label: "Pattern Makers", icon: Scissors },
  { id: "illustrator", label: "Illustrators", icon: Palette },
  { id: "photographer", label: "Photographers", icon: Camera },
  { id: "consultant", label: "Consultants", icon: Briefcase },
  { id: "marketing", label: "Marketing Experts", icon: TrendingUp },
];

// Experience levels
const experienceLevels = ["Entry Level", "Mid Level", "Senior", "Expert"];

// Sample freelancers data
const freelancers = [
  {
    id: "f1",
    name: "Priya Sharma",
    title: "Senior Fashion Designer",
    category: "designer",
    expertise: ["Womenswear", "Sustainable Fashion", "CAD Design", "Tech Packs"],
    rating: 4.9,
    reviews: 156,
    location: "Mumbai, India",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop",
    hourlyRate: "₹2,500/hr",
    experience: "8+ years",
    experienceLevel: "Expert",
    completedProjects: 234,
    bio: "Award-winning fashion designer specializing in sustainable womenswear with global brand experience.",
  },
  {
    id: "f2",
    name: "Rahul Verma",
    title: "Pattern Making Specialist",
    category: "pattern",
    expertise: ["Garment Patterns", "Grading", "Marker Making", "Optitex"],
    rating: 4.8,
    reviews: 98,
    location: "Delhi NCR, India",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop",
    hourlyRate: "₹1,800/hr",
    experience: "6+ years",
    experienceLevel: "Senior",
    completedProjects: 187,
    bio: "Expert pattern maker with expertise in complex constructions and digital pattern software.",
  },
  {
    id: "f3",
    name: "Anita Roy",
    title: "Fashion Illustrator",
    category: "illustrator",
    expertise: ["Technical Drawings", "Illustrations", "Adobe Suite", "Procreate"],
    rating: 5.0,
    reviews: 203,
    location: "Bangalore, India",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop",
    hourlyRate: "₹1,500/hr",
    experience: "5+ years",
    experienceLevel: "Senior",
    completedProjects: 312,
    bio: "Creative illustrator bringing fashion concepts to life with detailed technical and artistic drawings.",
  },
  {
    id: "f4",
    name: "Vikram Singh",
    title: "Fashion Photographer",
    category: "photographer",
    expertise: ["Product Shots", "Lookbooks", "E-commerce", "Editorial"],
    rating: 4.7,
    reviews: 145,
    location: "Mumbai, India",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop",
    hourlyRate: "₹3,000/hr",
    experience: "10+ years",
    experienceLevel: "Expert",
    completedProjects: 456,
    bio: "Professional fashion photographer with studio and on-location expertise for all types of fashion content.",
  },
  {
    id: "f5",
    name: "Meera Krishnan",
    title: "Fashion Business Consultant",
    category: "consultant",
    expertise: ["Brand Strategy", "Market Entry", "Supply Chain", "D2C Setup"],
    rating: 4.9,
    reviews: 67,
    location: "Chennai, India",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&h=150&fit=crop",
    hourlyRate: "₹4,000/hr",
    experience: "12+ years",
    experienceLevel: "Expert",
    completedProjects: 89,
    bio: "Strategic consultant helping fashion brands scale with proven go-to-market and operational strategies.",
  },
  {
    id: "f6",
    name: "Arjun Patel",
    title: "Digital Marketing Specialist",
    category: "marketing",
    expertise: ["Social Media", "Influencer Marketing", "Performance Ads", "Content Strategy"],
    rating: 4.6,
    reviews: 112,
    location: "Ahmedabad, India",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop",
    hourlyRate: "₹2,000/hr",
    experience: "4+ years",
    experienceLevel: "Mid Level",
    completedProjects: 178,
    bio: "Growth-focused marketer specializing in fashion and lifestyle brands with proven ROI track record.",
  },
  {
    id: "f7",
    name: "Kavya Nair",
    title: "CAD Designer",
    category: "designer",
    expertise: ["CLO 3D", "Browzwear", "Tech Packs", "3D Sampling"],
    rating: 4.8,
    reviews: 89,
    location: "Tiruppur, India",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop",
    hourlyRate: "₹1,600/hr",
    experience: "3+ years",
    experienceLevel: "Mid Level",
    completedProjects: 134,
    bio: "3D CAD specialist helping brands reduce sampling costs with virtual prototyping and tech pack creation.",
  },
  {
    id: "f8",
    name: "Sanjay Gupta",
    title: "Textile Consultant",
    category: "consultant",
    expertise: ["Fabric Sourcing", "Quality Control", "Vendor Management", "Costing"],
    rating: 4.9,
    reviews: 178,
    location: "Surat, India",
    verified: true,
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop",
    hourlyRate: "₹2,800/hr",
    experience: "15+ years",
    experienceLevel: "Expert",
    completedProjects: 267,
    bio: "Veteran textile expert with deep industry connections for fabric sourcing and quality assurance.",
  },
];

const Freelancers = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filteredFreelancers = useMemo(() => {
    let result = freelancers;

    if (searchQuery) {
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.expertise.some((e) => e.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    if (selectedCategory !== "all") {
      result = result.filter((f) => f.category === selectedCategory);
    }

    return result;
  }, [searchQuery, selectedCategory]);

  return (
    <DashboardLayout>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 sm:mb-6"
      >
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-3xl">
            Freelancers
          </h1>
        </div>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Connect with expert designers, pattern makers, and consultants
        </p>
      </motion.div>

      {/* Search & Filter Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-4 space-y-3"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, skill, or expertise..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {expertiseCategories.map((cat) => {
            const Icon = cat.icon;
            return (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "shrink-0 gap-1.5",
                  selectedCategory === cat.id && "shadow-sm"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs">{cat.label}</span>
              </Button>
            );
          })}
        </div>
      </motion.div>

      {/* Results Count */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredFreelancers.length} freelancers available
        </p>
      </div>

      {/* Freelancer Cards */}
      <div className="space-y-4">
        {filteredFreelancers.map((freelancer, index) => (
          <motion.div
            key={freelancer.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className="overflow-hidden border-border bg-card transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row">
                  {/* Avatar & Basic Info */}
                  <div className="flex items-start gap-4">
                    <Avatar className="h-16 w-16 shrink-0 border-2 border-border">
                      <AvatarImage src={freelancer.avatar} alt={freelancer.name} />
                      <AvatarFallback>
                        {freelancer.name.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">
                          {freelancer.name}
                        </h3>
                        {freelancer.verified && (
                          <BadgeCheck className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {freelancer.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {freelancer.location}
                        </span>
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-primary text-primary" />
                          {freelancer.rating} ({freelancer.reviews})
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {freelancer.experience}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right side - Rate & Actions (Desktop) */}
                  <div className="hidden sm:flex sm:flex-col sm:items-end sm:justify-between sm:ml-auto">
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">
                        {freelancer.hourlyRate}
                      </p>
                      <Badge variant="secondary" className="mt-1">
                        {freelancer.experienceLevel}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="gap-1">
                        <MessageCircle className="h-3.5 w-3.5" />
                        Message
                      </Button>
                      <Button size="sm" className="gap-1">
                        <Briefcase className="h-3.5 w-3.5" />
                        Hire
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Bio */}
                <p className="mt-3 text-sm text-muted-foreground">
                  {freelancer.bio}
                </p>

                {/* Expertise Tags */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {freelancer.expertise.map((skill) => (
                    <Badge
                      key={skill}
                      variant="outline"
                      className="text-xs font-normal"
                    >
                      {skill}
                    </Badge>
                  ))}
                </div>

                {/* Stats Row */}
                <div className="mt-4 flex items-center gap-6 border-t border-border pt-3 text-sm">
                  <div>
                    <span className="font-semibold text-foreground">
                      {freelancer.completedProjects}
                    </span>
                    <span className="ml-1 text-muted-foreground">projects completed</span>
                  </div>
                </div>

                {/* Mobile Actions */}
                <div className="mt-4 flex items-center justify-between sm:hidden">
                  <div>
                    <p className="text-lg font-bold text-foreground">
                      {freelancer.hourlyRate}
                    </p>
                    <Badge variant="secondary" className="mt-1">
                      {freelancer.experienceLevel}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="gap-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" className="gap-1">
                      <Briefcase className="h-3.5 w-3.5" />
                      Hire
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Empty State */}
      {filteredFreelancers.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-foreground">No freelancers found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your search or filter criteria
          </p>
        </motion.div>
      )}
    </DashboardLayout>
  );
};

export default Freelancers;
