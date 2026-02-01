'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button } from '@/components/ui';
import { examAPI } from '@/services/api';
import { Exam } from '@/types';
import { GraduationCap, Clock, Calendar, PlayCircle, CheckCircle, AlertCircle } from 'lucide-react';

export default function UjianSiswaPage() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      const response = await examAPI.getAll();
      setExams(response.data.data.data || response.data.data);
    } catch (error) {
      console.error('Failed to fetch exams:', error);
    } finally {
      setLoading(false);
    }
  };

  const getExamStatus = (exam: Exam) => {
    const now = new Date();
    const startTime = new Date(exam.start_time);
    const endTime = new Date(exam.end_time);

    if (exam.my_result?.status === 'completed') {
      return { label: 'Selesai', color: 'bg-green-100 text-green-700', icon: CheckCircle };
    }
    if (now < startTime) {
      return { label: 'Belum Mulai', color: 'bg-gray-100 text-gray-700', icon: Clock };
    }
    if (now > endTime) {
      return { label: 'Berakhir', color: 'bg-red-100 text-red-700', icon: AlertCircle };
    }
    if (exam.my_result?.status === 'in_progress') {
      return { label: 'Sedang Dikerjakan', color: 'bg-yellow-100 text-yellow-700', icon: PlayCircle };
    }
    return { label: 'Tersedia', color: 'bg-blue-100 text-blue-700', icon: PlayCircle };
  };

  const canStartExam = (exam: Exam) => {
    const now = new Date();
    const startTime = new Date(exam.start_time);
    const endTime = new Date(exam.end_time);
    
    return now >= startTime && now <= endTime && exam.my_result?.status !== 'completed';
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ujian Saya</h1>
          <p className="text-gray-600">Daftar ujian yang tersedia untuk Anda</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : exams.length === 0 ? (
          <Card className="p-12 text-center">
            <GraduationCap className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Belum Ada Ujian</h3>
            <p className="text-gray-500">Saat ini belum ada ujian yang tersedia untuk Anda</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {exams.map((exam) => {
              const status = getExamStatus(exam);
              const StatusIcon = status.icon;
              
              return (
                <Card key={exam.id} className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <GraduationCap className="w-6 h-6 text-blue-600" />
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${status.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </span>
                  </div>

                  <h3 className="font-semibold text-gray-900 mb-1">{exam.title}</h3>
                  <p className="text-sm text-gray-500 mb-4">{exam.subject}</p>

                  <div className="space-y-2 text-sm text-gray-600 mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDateTime(exam.start_time)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{exam.duration_minutes} menit</span>
                    </div>
                  </div>

                  {exam.my_result?.status === 'completed' ? (
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <p className="text-sm text-gray-600">Nilai Anda</p>
                      <p className="text-2xl font-bold text-green-600">{exam.my_result.score}</p>
                    </div>
                  ) : canStartExam(exam) ? (
                    <Button
                      className="w-full"
                      onClick={() => router.push(`/ujian/${exam.id}`)}
                    >
                      <PlayCircle className="w-4 h-4 mr-2" />
                      {exam.my_result?.status === 'in_progress' ? 'Lanjutkan Ujian' : 'Mulai Ujian'}
                    </Button>
                  ) : (
                    <Button className="w-full" variant="outline" disabled>
                      Tidak Tersedia
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
