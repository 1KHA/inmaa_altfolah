"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Search, Send, Loader2 } from "lucide-react";
import { useToast } from "../../../../components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Team {
  id: string;
  teamName: string;
  ideaDescription: string;
  ideaName: string;
  challenge: string;
  hackathonTrack: string;
  leaderName: string;
  memberCount: number;
  maxMembers: number;
  createdAt: string;
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [filteredTeams, setFilteredTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinMessage, setJoinMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // Fetch available teams
  const fetchTeams = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/participant/available-teams');
      if (response.ok) {
        const data = await response.json();
        setTeams(data.teams);
        setFilteredTeams(data.teams);
      } else {
        const errorData = await response.json();
        toast({
          title: "خطأ",
          description: errorData.error || "فشل في جلب الفرق المتاحة",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ في الاتصال",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  // Filter teams based on search term
  useEffect(() => {
    if (!searchTerm) {
      setFilteredTeams(teams);
    } else {
      const filtered = teams.filter(team =>
        team.teamName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        team.ideaDescription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        team.leaderName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        team.challenge?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredTeams(filtered);
    }
  }, [searchTerm, teams]);

  // Handle join request
  const handleJoinRequest = async () => {
    if (!selectedTeam) return;

    try {
      setSubmitting(true);
      const response = await fetch('/api/participant/join-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId: selectedTeam.id,
          message: joinMessage.trim() || null,
        }),
      });

      if (response.ok) {
        toast({
          title: "تم الإرسال بنجاح",
          description: "تم إرسال طلب الانضمام للفريق",
        });
        setIsJoinModalOpen(false);
        setJoinMessage("");
        setSelectedTeam(null);
        // Refresh teams list
        fetchTeams();
      } else {
        const errorData = await response.json();
        toast({
          title: "خطأ",
          description: errorData.error || "فشل في إرسال طلب الانضمام",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "حدث خطأ في الاتصال",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openJoinModal = (team: Team) => {
    setSelectedTeam(team);
    setIsJoinModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>جاري تحميل الفرق المتاحة...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full space-y-4 sm:space-y-6 p-0 sm:p-2 md:p-4" dir="rtl">
      <div className="flex flex-col gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">الفرق المتاحة</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            تصفح الفرق المتاحة وأرسل طلب انضمام للفريق الذي يناسبك
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="ابحث في الفرق..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>
      </div>

      {filteredTeams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">لا توجد فرق متاحة</h3>
            <p className="text-muted-foreground text-center">
              {searchTerm 
                ? "لم يتم العثور على فرق تطابق البحث" 
                : "لا توجد فرق متاحة للانضمام في الوقت الحالي"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3 sm:gap-4 lg:gap-6">
          {filteredTeams.map((team) => (
            <Card key={team.id} className="flex flex-col min-w-0 hover:shadow-lg transition-shadow">
              <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg sm:text-xl mb-2 leading-snug break-words">{team.teamName}</CardTitle>
                    <CardDescription className="text-sm break-words">
                      قائد الفريق: {team.leaderName}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                    <Users className="h-3 w-3" />
                    {team.memberCount}/{team.maxMembers}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:p-6 sm:pt-0">
                <div>
                  <h4 className="font-medium mb-1">الفكرة:</h4>
                  <p className="text-sm text-muted-foreground line-clamp-3 break-words">
                    {team.ideaDescription || team.ideaName}
                  </p>
                </div>

                {team.challenge && (
                  <div>
                    <h4 className="font-medium mb-1">التحدي:</h4>
                    <p className="text-sm text-muted-foreground break-words">{team.challenge}</p>
                  </div>
                )}

                {team.hackathonTrack && (
                  <div>
                    <h4 className="font-medium mb-1">المسار:</h4>
                    <Badge variant="outline">{team.hackathonTrack}</Badge>
                  </div>
                )}

                <Button 
                  onClick={() => openJoinModal(team)}
                  className="w-full mt-auto"
                  disabled={team.memberCount >= team.maxMembers}
                >
                  <Send className="h-4 w-4 ml-2" />
                  {team.memberCount >= team.maxMembers ? "الفريق مكتمل" : "طلب الانضمام"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Join Request Modal */}
      <Dialog open={isJoinModalOpen} onOpenChange={setIsJoinModalOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>طلب الانضمام للفريق</DialogTitle>
            <DialogDescription>
              أرسل طلب انضمام لفريق "{selectedTeam?.teamName}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="message">رسالة اختيارية</Label>
              <Textarea
                id="message"
                placeholder="اكتب رسالة قصيرة عن نفسك وسبب رغبتك في الانضمام للفريق..."
                value={joinMessage}
                onChange={(e) => setJoinMessage(e.target.value)}
                rows={4}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {joinMessage.length}/500 حرف
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setIsJoinModalOpen(false)}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleJoinRequest}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 ml-2" />
                  إرسال الطلب
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
