"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, Eye, Clock, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "../../../../components/ui/use-toast";

interface JoinRequest {
  id: string;
  status: string; // pending, accepted, rejected
  message?: string;
  createdAt: string;
  participant: {
    id: string;
    email: string;
    fullName?: string;
    firstName?: string;
    secondName?: string;
    familyName?: string;
    contactNumber?: string;
    phoneNumber?: string;
    university?: string;
    universityMajor?: string;
    major?: string;
    city?: string;
    residence?: string;
    professionalField?: string;
    employmentStatus?: string;
    gender?: string;
    isUniversityStudent?: boolean;
    canAttendHackathon?: boolean;
    canAttend?: boolean;
  };
}

export default function JoinRequestsPage() {
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<JoinRequest | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const { toast } = useToast();

  const fetchJoinRequests = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/team-leader/join-requests');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch join requests');
      }
      const data = await response.json();
      // Handle the API response structure: {requests: [...]}
      const requests: JoinRequest[] = data.requests || [];
      setJoinRequests(requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJoinRequests();
  }, []);

  const handleJoinRequest = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      const response = await fetch('/api/team-leader/handle-join-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requestId, action }),
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "نجح",
          description: action === 'accept' 
            ? "تم قبول طلب الانضمام بنجاح" 
            : "تم رفض طلب الانضمام",
        });
        fetchJoinRequests(); // Refresh the list
      } else {
        const data = await response.json();
        toast({
          title: "خطأ",
          description: data.error || `فشل في ${action === 'accept' ? 'قبول' : 'رفض'} الطلب`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: `حدث خطأ أثناء ${action === 'accept' ? 'قبول' : 'رفض'} الطلب`,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">مقبول</span>;
      case 'pending':
        return <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">قيد المراجعة</span>;
      case 'rejected':
        return <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">مرفوض</span>;
      default:
        return <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const getDisplayName = (participant: JoinRequest['participant']) => {
    return participant.fullName || 
           `${participant.firstName || ''} ${participant.secondName || ''} ${participant.familyName || ''}`.trim() || 
           'غير متوفر';
  };

  const pendingRequests = joinRequests.filter(req => req.status === 'pending');
  const processedRequests = joinRequests.filter(req => req.status !== 'pending');

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl sm:text-3xl font-bold">الدعوات المستلمة</h1>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4 text-center flex flex-col items-center">
            <div className="flex items-center justify-center mb-2">
              <Clock className="h-5 w-5 text-yellow-500" />
            </div>
            <h3 className="text-2xl font-bold">{pendingRequests.length}</h3>
            <p className="text-muted-foreground">طلبات قيد المراجعة</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center flex flex-col items-center">
            <div className="flex items-center justify-center mb-2">
              <Check className="h-5 w-5 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold">
              {joinRequests.filter(req => req.status === 'accepted').length}
            </h3>
            <p className="text-muted-foreground">طلبات مقبولة</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center flex flex-col items-center">
            <div className="flex items-center justify-center mb-2">
              <X className="h-5 w-5 text-red-500" />
            </div>
            <h3 className="text-2xl font-bold">
              {joinRequests.filter(req => req.status === 'rejected').length}
            </h3>
            <p className="text-muted-foreground">طلبات مرفوضة</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center flex flex-col items-center">
            <div className="flex items-center justify-center mb-2">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-2xl font-bold">{joinRequests.length}</h3>
            <p className="text-muted-foreground">إجمالي الطلبات</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              طلبات قيد المراجعة ({pendingRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center p-4">جاري تحميل البيانات...</p>
            ) : error ? (
              <p className="text-center p-4 text-red-500">{error}</p>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full border-collapse min-w-[640px]">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border p-2 text-right">الاسم</th>
                      <th className="border p-2 text-right">البريد الإلكتروني</th>
                      <th className="border p-2 text-right hidden md:table-cell">الجامعة</th>
                      <th className="border p-2 text-right hidden md:table-cell">التخصص</th>
                      <th className="border p-2 text-right hidden md:table-cell">المدينة</th>
                      <th className="border p-2 text-right hidden sm:table-cell">تاريخ الطلب</th>
                      <th className="border p-2 text-right hidden sm:table-cell">الرسالة</th>
                      <th className="border p-2 text-right">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-muted/50">
                      <td className="border p-2">{getDisplayName(request.participant)}</td>
                      <td className="border p-2">{request.participant.email}</td>
                      <td className="border p-2 hidden md:table-cell">{request.participant.university || 'غير متوفر'}</td>
                      <td className="border p-2 hidden md:table-cell">
                        {request.participant.universityMajor || request.participant.major || 'غير متوفر'}
                      </td>
                      <td className="border p-2 hidden md:table-cell">
                        {request.participant.city || request.participant.residence || 'غير متوفر'}
                      </td>
                      <td className="border p-2 hidden sm:table-cell">
                        {new Date(request.createdAt).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="border p-2 hidden sm:table-cell">
                        {request.message ? (
                          <span className="text-sm">{request.message.substring(0, 50)}...</span>
                        ) : (
                          'لا توجد رسالة'
                        )}
                      </td>
                        <td className="border p-2">
                          <div className="flex gap-2 justify-center">
                            <button
                              className="p-1 rounded-md hover:bg-muted"
                              title="عرض التفاصيل"
                              onClick={() => {
                                setSelectedRequest(request);
                                setIsViewModalOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button 
                              className="p-1 rounded-md hover:bg-muted text-green-600"
                              title="قبول الطلب"
                              onClick={() => handleJoinRequest(request.id, 'accept')}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button 
                              className="p-1 rounded-md hover:bg-muted text-red-600"
                              title="رفض الطلب"
                              onClick={() => handleJoinRequest(request.id, 'reject')}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Processed Requests */}
      {processedRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>الطلبات المعالجة ({processedRequests.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-muted">
                    <th className="border p-2 text-right">الاسم</th>
                    <th className="border p-2 text-right hidden sm:table-cell">البريد الإلكتروني</th>
                    <th className="border p-2 text-right">الحالة</th>
                    <th className="border p-2 text-right hidden sm:table-cell">تاريخ الطلب</th>
                    <th className="border p-2 text-right">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {processedRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-muted/50">
                      <td className="border p-2">{getDisplayName(request.participant)}</td>
                      <td className="border p-2 hidden sm:table-cell">{request.participant.email}</td>
                      <td className="border p-2">{getStatusBadge(request.status)}</td>
                      <td className="border p-2 hidden sm:table-cell">
                        {new Date(request.createdAt).toLocaleDateString('ar-SA')}
                      </td>
                      <td className="border p-2">
                        <div className="flex gap-2 justify-center">
                          <button
                            className="p-1 rounded-md hover:bg-muted"
                            title="عرض التفاصيل"
                            onClick={() => {
                              setSelectedRequest(request);
                              setIsViewModalOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && joinRequests.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">لا توجد طلبات انضمام</h3>
            <p className="text-muted-foreground">
              لم يتم استلام أي طلبات انضمام لفريقك حتى الآن.
            </p>
          </CardContent>
        </Card>
      )}

      {/* View Request Details Modal */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              تفاصيل طلب الانضمام: {selectedRequest && getDisplayName(selectedRequest.participant)}
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 p-3 sm:p-4 max-h-[70vh] overflow-y-auto text-right">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <p><strong>الاسم:</strong> {getDisplayName(selectedRequest.participant)}</p>
                <p><strong>البريد الإلكتروني:</strong> {selectedRequest.participant.email}</p>
                <p><strong>رقم التواصل:</strong> {selectedRequest.participant.contactNumber || selectedRequest.participant.phoneNumber || 'غير متوفر'}</p>
                <p><strong>الجنس:</strong> {selectedRequest.participant.gender || 'غير متوفر'}</p>
                <p><strong>الجامعة:</strong> {selectedRequest.participant.university || 'غير متوفر'}</p>
                <p><strong>التخصص:</strong> {selectedRequest.participant.universityMajor || selectedRequest.participant.major || 'غير متوفر'}</p>
                <p><strong>المجال المهني:</strong> {selectedRequest.participant.professionalField || selectedRequest.participant.employmentStatus || 'غير متوفر'}</p>
                <p><strong>المدينة:</strong> {selectedRequest.participant.city || selectedRequest.participant.residence || 'غير متوفر'}</p>
                <p><strong>طالب جامعي؟</strong> {selectedRequest.participant.isUniversityStudent !== undefined ? (selectedRequest.participant.isUniversityStudent ? 'نعم' : 'لا') : 'غير متوفر'}</p>
                <p><strong>يمكنه الحضور؟</strong> {selectedRequest.participant.canAttendHackathon !== undefined ? (selectedRequest.participant.canAttendHackathon ? 'نعم' : 'لا') : (selectedRequest.participant.canAttend !== undefined ? (selectedRequest.participant.canAttend ? 'نعم' : 'لا') : 'غير متوفر')}</p>
                <p><strong>حالة الطلب:</strong> {getStatusBadge(selectedRequest.status)}</p>
                <p><strong>تاريخ الطلب:</strong> {new Date(selectedRequest.createdAt).toLocaleDateString('ar-SA')}</p>
              </div>
              {selectedRequest.message && (
                <div className="mt-4">
                  <p><strong>رسالة المتقدم:</strong></p>
                  <div className="bg-muted p-3 rounded-md mt-2 text-sm sm:text-base">
                    {selectedRequest.message}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row">
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              {selectedRequest?.status === 'pending' && (
                <>
                  <Button 
                    variant="outline" 
                    className="text-green-600 border-green-600 hover:bg-green-50 w-full sm:w-auto"
                    onClick={() => {
                      if (selectedRequest) {
                        handleJoinRequest(selectedRequest.id, 'accept');
                        setIsViewModalOpen(false);
                      }
                    }}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    قبول
                  </Button>
                  <Button 
                    variant="outline" 
                    className="text-red-600 border-red-600 hover:bg-red-50 w-full sm:w-auto"
                    onClick={() => {
                      if (selectedRequest) {
                        handleJoinRequest(selectedRequest.id, 'reject');
                        setIsViewModalOpen(false);
                      }
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    رفض
                  </Button>
                </>
              )}
              <Button onClick={() => setIsViewModalOpen(false)} className="w-full sm:w-auto">إغلاق</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
