'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card } from '@/components/ui';
import { BookOpen, FileText, Download, Play, Clock, User, Loader2, Search, Link as LinkIcon } from 'lucide-react';
import api, { materialAPI } from '@/services/api';

interface Material {
  id: number;
  title: string;
  subject: string;
  description: string;
  type: 'video' | 'document' | 'link';
  file_url?: string;
  teacher: {
    name: string;
  };
  created_at: string;
}

export default function MateriSiswaPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      // Fetch from API - materials endpoint (filtered by student's class)
      const response = await api.get('/materials');
      const rawData = response.data?.data;
      const materialsData = Array.isArray(rawData) ? rawData : (rawData?.data || []);
      setMaterials(materialsData);
    } catch (error) {
      console.error('Failed to fetch materials:', error);
      // Empty state if API fails
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  };

  const subjects = ['all', ...new Set(materials.map(m => m.subject))];
  
  const filteredMaterials = materials.filter(m => {
    const matchesSubject = selectedSubject === 'all' || m.subject === selectedSubject;
    const matchesSearch = m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          m.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSubject && matchesSearch;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Play className="w-5 h-5 text-red-500" />;
      case 'document':
        return <FileText className="w-5 h-5 text-blue-500" />;
      case 'link':
        return <LinkIcon className="w-5 h-5 text-green-500" />;
      default:
        return <BookOpen className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'video': return 'Video';
      case 'document': return 'Dokumen';
      case 'link': return 'Link';
      default: return type;
    }
  };

  const getTypeBg = (type: string) => {
    switch (type) {
      case 'video': return 'bg-red-100';
      case 'document': return 'bg-blue-100';
      case 'link': return 'bg-green-100';
      default: return 'bg-gray-100';
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Materi Pembelajaran</h1>
          <p className="text-gray-600">Akses materi dari guru Anda</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Materi</p>
                <p className="text-xl font-bold text-gray-900">{materials.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <Play className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Video</p>
                <p className="text-xl font-bold text-gray-900">
                  {materials.filter(m => m.type === 'video').length}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Mata Pelajaran</p>
                <p className="text-xl font-bold text-gray-900">
                  {new Set(materials.map(m => m.subject)).size}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari materi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="all">Semua Mata Pelajaran</option>
            {subjects.filter(s => s !== 'all').map(subject => (
              <option key={subject} value={subject}>{subject}</option>
            ))}
          </select>
        </div>

        {/* Materials List */}
        {filteredMaterials.length === 0 ? (
          <Card className="p-8 text-center">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Belum ada materi</p>
            <p className="text-sm text-gray-400 mt-1">Materi akan muncul setelah guru mengunggah</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMaterials.map((material) => (
              <Card key={material.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-lg ${getTypeBg(material.type)} flex items-center justify-center flex-shrink-0`}>
                    {getTypeIcon(material.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{material.title}</h3>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{material.description}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  <span className="px-2 py-1 bg-teal-100 text-teal-700 text-xs rounded-full">
                    {material.subject}
                  </span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                    {getTypeLabel(material.type)}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <User className="w-4 h-4" />
                    <span>{material.teacher?.name || 'Guru'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="w-4 h-4" />
                    <span>{formatDate(material.created_at)}</span>
                  </div>
                </div>

                <button
                  className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                  onClick={async () => {
                    if (material.file_url) {
                      if (material.type === 'link') {
                        window.open(material.file_url, '_blank');
                      } else {
                        try {
                          const response = await materialAPI.download(material.id);
                          const contentType = response.headers['content-type'] || 'application/octet-stream';
                          const blob = new Blob([response.data], { type: contentType });
                          const url = window.URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          // Get filename from Content-Disposition or use title
                          const contentDisposition = response.headers['content-disposition'];
                          let filename = material.title;
                          if (contentDisposition) {
                            const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                            if (match) filename = match[1].replace(/['"]/g, '');
                          } else {
                            // Infer extension from file_url
                            const ext = material.file_url?.split('.').pop()?.split('?')[0];
                            if (ext && !filename.endsWith(`.${ext}`)) {
                              filename = `${filename}.${ext}`;
                            }
                          }
                          link.setAttribute('download', filename);
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          window.URL.revokeObjectURL(url);
                        } catch {
                          // Fallback: open in new tab
                          window.open(material.file_url, '_blank');
                        }
                      }
                    }
                  }}
                >
                  {material.type === 'video' ? (
                    <>
                      <Play className="w-4 h-4" />
                      Tonton Video
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download
                    </>
                  )}
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
