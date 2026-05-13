'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, CardHeader, Input, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { landingPageAPI, getSecureFileUrl } from '@/services/api';
import { DEFAULT_LANDING_CONTENT, mergeLandingContent } from '@/constants/landing';
import type { LandingContent } from '@/types/landing';
import { getApiErrorMessage } from '@/lib/api-error';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';

const emptyCard = { icon: '', title: '', text: '' };
const emptyProgram = { title: '', description: '' };
const emptyStep = { title: '', description: '' };
const emptyLink = { label: '', href: '' };

export default function LandingContentEditor() {
  const toast = useToast();
  const [content, setContent] = useState<LandingContent>(DEFAULT_LANDING_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<{
    logo: File | null;
    hero_background: File | null;
    hero_video: File | null;
  }>({
    logo: null,
    hero_background: null,
    hero_video: null,
  });

  const logoPreview = useMemo(() => {
    if (mediaFiles.logo) return URL.createObjectURL(mediaFiles.logo);
    return content.hero.logo_url ? getSecureFileUrl(content.hero.logo_url) : '';
  }, [mediaFiles.logo, content.hero.logo_url]);

  const backgroundPreview = useMemo(() => {
    if (mediaFiles.hero_background) return URL.createObjectURL(mediaFiles.hero_background);
    return content.hero.background_url ? getSecureFileUrl(content.hero.background_url) : '';
  }, [mediaFiles.hero_background, content.hero.background_url]);

  const videoPreview = useMemo(() => {
    if (mediaFiles.hero_video) return URL.createObjectURL(mediaFiles.hero_video);
    return content.hero.video_url ? getSecureFileUrl(content.hero.video_url) : '';
  }, [mediaFiles.hero_video, content.hero.video_url]);

  useEffect(() => {
    return () => {
      if (mediaFiles.logo) URL.revokeObjectURL(logoPreview);
      if (mediaFiles.hero_background) URL.revokeObjectURL(backgroundPreview);
      if (mediaFiles.hero_video) URL.revokeObjectURL(videoPreview);
    };
  }, [mediaFiles.logo, mediaFiles.hero_background, mediaFiles.hero_video, logoPreview, backgroundPreview, videoPreview]);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    try {
      const response = await landingPageAPI.getAdmin();
      const data = response.data?.data as Partial<LandingContent> | undefined;
      setContent(mergeLandingContent(DEFAULT_LANDING_CONTENT, data || null));
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Gagal memuat konten beranda'));
      setContent(DEFAULT_LANDING_CONTENT);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await landingPageAPI.update(content, mediaFiles);
      const data = response.data?.data as Partial<LandingContent> | undefined;
      setContent(mergeLandingContent(DEFAULT_LANDING_CONTENT, data || null));
      setMediaFiles({
        logo: null,
        hero_background: null,
        hero_video: null,
      });
      toast.success('Konten beranda berhasil disimpan');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Gagal menyimpan konten beranda'));
    } finally {
      setSaving(false);
    }
  };

  const updateHero = (field: 'subtitle' | 'title' | 'description', value: string) => {
    setContent((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        [field]: value,
      },
    }));
  };

  const updateHeroCta = (key: 'cta_primary' | 'cta_secondary', field: 'label' | 'href', value: string) => {
    setContent((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        [key]: {
          ...prev.hero[key],
          [field]: value,
        },
      },
    }));
  };

  const updateAbout = (field: 'label' | 'title' | 'description', value: string) => {
    setContent((prev) => ({
      ...prev,
      about: {
        ...prev.about,
        [field]: value,
      },
    }));
  };

  const updateAboutCard = (index: number, field: 'icon' | 'title' | 'text', value: string) => {
    setContent((prev) => {
      const cards = [...prev.about.cards];
      cards[index] = { ...cards[index], [field]: value };
      return {
        ...prev,
        about: {
          ...prev.about,
          cards,
        },
      };
    });
  };

  const addAboutCard = () => {
    setContent((prev) => ({
      ...prev,
      about: {
        ...prev.about,
        cards: [...prev.about.cards, { ...emptyCard }],
      },
    }));
  };

  const removeAboutCard = (index: number) => {
    setContent((prev) => ({
      ...prev,
      about: {
        ...prev.about,
        cards: prev.about.cards.filter((_, idx) => idx !== index),
      },
    }));
  };

  const updatePrograms = (field: 'label' | 'title' | 'description', value: string) => {
    setContent((prev) => ({
      ...prev,
      programs: {
        ...prev.programs,
        [field]: value,
      },
    }));
  };

  const updateProgramItem = (index: number, field: 'title' | 'description', value: string) => {
    setContent((prev) => {
      const items = [...prev.programs.items];
      items[index] = { ...items[index], [field]: value };
      return {
        ...prev,
        programs: {
          ...prev.programs,
          items,
        },
      };
    });
  };

  const addProgramItem = () => {
    setContent((prev) => ({
      ...prev,
      programs: {
        ...prev.programs,
        items: [...prev.programs.items, { ...emptyProgram }],
      },
    }));
  };

  const removeProgramItem = (index: number) => {
    setContent((prev) => ({
      ...prev,
      programs: {
        ...prev.programs,
        items: prev.programs.items.filter((_, idx) => idx !== index),
      },
    }));
  };

  const updateFacilities = (field: 'label' | 'title' | 'description', value: string) => {
    setContent((prev) => ({
      ...prev,
      facilities: {
        ...prev.facilities,
        [field]: value,
      },
    }));
  };

  const updateRegistration = (field: 'label' | 'title' | 'description' | 'cta_label' | 'cta_href', value: string) => {
    setContent((prev) => ({
      ...prev,
      registration: {
        ...prev.registration,
        [field]: value,
      },
    }));
  };

  const updateRegistrationStep = (index: number, field: 'title' | 'description', value: string) => {
    setContent((prev) => {
      const steps = [...prev.registration.steps];
      steps[index] = { ...steps[index], [field]: value };
      return {
        ...prev,
        registration: {
          ...prev.registration,
          steps,
        },
      };
    });
  };

  const addRegistrationStep = () => {
    setContent((prev) => ({
      ...prev,
      registration: {
        ...prev.registration,
        steps: [...prev.registration.steps, { ...emptyStep }],
      },
    }));
  };

  const removeRegistrationStep = (index: number) => {
    setContent((prev) => ({
      ...prev,
      registration: {
        ...prev.registration,
        steps: prev.registration.steps.filter((_, idx) => idx !== index),
      },
    }));
  };

  const updateFooter = (field: 'about_title' | 'about_text' | 'instagram_url' | 'youtube_url', value: string) => {
    setContent((prev) => ({
      ...prev,
      footer: {
        ...prev.footer,
        [field]: value,
      },
    }));
  };

  const updateInfoLink = (index: number, field: 'label' | 'href', value: string) => {
    setContent((prev) => {
      const infoLinks = [...prev.footer.info_links];
      infoLinks[index] = { ...infoLinks[index], [field]: value };
      return {
        ...prev,
        footer: {
          ...prev.footer,
          info_links: infoLinks,
        },
      };
    });
  };

  const addInfoLink = () => {
    setContent((prev) => ({
      ...prev,
      footer: {
        ...prev.footer,
        info_links: [...prev.footer.info_links, { ...emptyLink }],
      },
    }));
  };

  const removeInfoLink = (index: number) => {
    setContent((prev) => ({
      ...prev,
      footer: {
        ...prev.footer,
        info_links: prev.footer.info_links.filter((_, idx) => idx !== index),
      },
    }));
  };

  const updateContactLine = (index: number, value: string) => {
    setContent((prev) => {
      const lines = [...prev.footer.contact.lines];
      lines[index] = value;
      return {
        ...prev,
        footer: {
          ...prev.footer,
          contact: {
            ...prev.footer.contact,
            lines,
          },
        },
      };
    });
  };

  const addContactLine = () => {
    setContent((prev) => ({
      ...prev,
      footer: {
        ...prev.footer,
        contact: {
          ...prev.footer.contact,
          lines: [...prev.footer.contact.lines, ''],
        },
      },
    }));
  };

  const removeContactLine = (index: number) => {
    setContent((prev) => ({
      ...prev,
      footer: {
        ...prev.footer,
        contact: {
          ...prev.footer.contact,
          lines: prev.footer.contact.lines.filter((_, idx) => idx !== index),
        },
      },
    }));
  };

  if (loading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Konten Beranda"
          subtitle="Atur semua teks, tautan, dan media yang tampil di landing page."
          action={(
            <Button size="sm" onClick={handleSave} disabled={saving} leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}>
              {saving ? 'Menyimpan...' : 'Simpan Konten'}
            </Button>
          )}
        />
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Media Hero</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Logo, background, dan video hero.</p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Logo</p>
                {logoPreview && (
                  <img src={logoPreview} alt="Preview logo" className="h-20 w-20 object-contain rounded-lg border border-slate-200 dark:border-slate-700 bg-white" />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/jpg,image/webp"
                  onChange={(e) => setMediaFiles((prev) => ({ ...prev, logo: e.target.files?.[0] || null }))}
                  className="block w-full text-xs text-slate-700 dark:text-slate-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-sky-600 file:text-white hover:file:bg-sky-700"
                />
                {mediaFiles.logo && (
                  <p className="text-xs text-slate-500">File baru: {mediaFiles.logo.name}</p>
                )}
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Background</p>
                {backgroundPreview && (
                  <img src={backgroundPreview} alt="Preview background" className="h-20 w-full object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/jpg,image/webp"
                  onChange={(e) => setMediaFiles((prev) => ({ ...prev, hero_background: e.target.files?.[0] || null }))}
                  className="block w-full text-xs text-slate-700 dark:text-slate-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-sky-600 file:text-white hover:file:bg-sky-700"
                />
                {mediaFiles.hero_background && (
                  <p className="text-xs text-slate-500">File baru: {mediaFiles.hero_background.name}</p>
                )}
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Video Hero</p>
                {videoPreview && (
                  <video src={videoPreview} className="h-20 w-full rounded-lg border border-slate-200 dark:border-slate-700" controls />
                )}
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  onChange={(e) => setMediaFiles((prev) => ({ ...prev, hero_video: e.target.files?.[0] || null }))}
                  className="block w-full text-xs text-slate-700 dark:text-slate-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-sky-600 file:text-white hover:file:bg-sky-700"
                />
                {mediaFiles.hero_video && (
                  <p className="text-xs text-slate-500">File baru: {mediaFiles.hero_video.name}</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Hero</h3>
            <Input
              label="Subjudul"
              value={content.hero.subtitle}
              onChange={(e) => updateHero('subtitle', e.target.value)}
            />
            <Textarea
              label="Judul Lengkap (boleh pakai baris baru)"
              value={content.hero.title}
              onChange={(e) => updateHero('title', e.target.value)}
              rows={3}
            />
            <Textarea
              label="Deskripsi"
              value={content.hero.description}
              onChange={(e) => updateHero('description', e.target.value)}
              rows={3}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="CTA Utama"
                value={content.hero.cta_primary.label}
                onChange={(e) => updateHeroCta('cta_primary', 'label', e.target.value)}
              />
              <Input
                label="Link CTA Utama"
                value={content.hero.cta_primary.href}
                onChange={(e) => updateHeroCta('cta_primary', 'href', e.target.value)}
              />
              <Input
                label="CTA Sekunder"
                value={content.hero.cta_secondary.label}
                onChange={(e) => updateHeroCta('cta_secondary', 'label', e.target.value)}
              />
              <Input
                label="Link CTA Sekunder"
                value={content.hero.cta_secondary.href}
                onChange={(e) => updateHeroCta('cta_secondary', 'href', e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Profil / Tentang Kami</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Konten visi, misi, dan tujuan.</p>
              </div>
              <Button size="sm" variant="outline" onClick={addAboutCard} leftIcon={<Plus className="w-4 h-4" />}>
                Tambah Kartu
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Label" value={content.about.label} onChange={(e) => updateAbout('label', e.target.value)} />
              <Input label="Judul" value={content.about.title} onChange={(e) => updateAbout('title', e.target.value)} />
            </div>
            <Textarea
              label="Deskripsi Singkat"
              value={content.about.description}
              onChange={(e) => updateAbout('description', e.target.value)}
              rows={2}
            />
            <div className="space-y-4">
              {content.about.cards.map((card, idx) => (
                <div key={`about-${idx}`} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Kartu {idx + 1}</p>
                    <Button size="sm" variant="outline" onClick={() => removeAboutCard(idx)} leftIcon={<Trash2 className="w-3.5 h-3.5" />}>
                      Hapus
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input label="Icon" value={card.icon} onChange={(e) => updateAboutCard(idx, 'icon', e.target.value)} />
                    <Input label="Judul" value={card.title} onChange={(e) => updateAboutCard(idx, 'title', e.target.value)} />
                  </div>
                  <Textarea
                    label="Isi"
                    value={card.text}
                    onChange={(e) => updateAboutCard(idx, 'text', e.target.value)}
                    rows={2}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Program</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Daftar program unggulan dan kurikulum.</p>
              </div>
              <Button size="sm" variant="outline" onClick={addProgramItem} leftIcon={<Plus className="w-4 h-4" />}>
                Tambah Program
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Label" value={content.programs.label} onChange={(e) => updatePrograms('label', e.target.value)} />
              <Input label="Judul" value={content.programs.title} onChange={(e) => updatePrograms('title', e.target.value)} />
            </div>
            <Textarea
              label="Deskripsi Singkat"
              value={content.programs.description}
              onChange={(e) => updatePrograms('description', e.target.value)}
              rows={2}
            />
            <div className="space-y-4">
              {content.programs.items.map((item, idx) => (
                <div key={`program-${idx}`} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Program {idx + 1}</p>
                    <Button size="sm" variant="outline" onClick={() => removeProgramItem(idx)} leftIcon={<Trash2 className="w-3.5 h-3.5" />}>
                      Hapus
                    </Button>
                  </div>
                  <Input label="Judul" value={item.title} onChange={(e) => updateProgramItem(idx, 'title', e.target.value)} />
                  <Textarea
                    label="Deskripsi"
                    value={item.description}
                    onChange={(e) => updateProgramItem(idx, 'description', e.target.value)}
                    rows={2}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Fasilitas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Label" value={content.facilities.label} onChange={(e) => updateFacilities('label', e.target.value)} />
              <Input label="Judul" value={content.facilities.title} onChange={(e) => updateFacilities('title', e.target.value)} />
            </div>
            <Textarea
              label="Deskripsi Singkat"
              value={content.facilities.description}
              onChange={(e) => updateFacilities('description', e.target.value)}
              rows={2}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">Daftar fasilitas dan foto dikelola dari tab Fasilitas.</p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Pendaftaran</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Langkah dan CTA pendaftaran.</p>
              </div>
              <Button size="sm" variant="outline" onClick={addRegistrationStep} leftIcon={<Plus className="w-4 h-4" />}>
                Tambah Langkah
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Label" value={content.registration.label} onChange={(e) => updateRegistration('label', e.target.value)} />
              <Input label="Judul" value={content.registration.title} onChange={(e) => updateRegistration('title', e.target.value)} />
            </div>
            <Textarea
              label="Deskripsi Singkat"
              value={content.registration.description}
              onChange={(e) => updateRegistration('description', e.target.value)}
              rows={2}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Teks CTA" value={content.registration.cta_label} onChange={(e) => updateRegistration('cta_label', e.target.value)} />
              <Input label="Link CTA" value={content.registration.cta_href} onChange={(e) => updateRegistration('cta_href', e.target.value)} />
            </div>
            <div className="space-y-4">
              {content.registration.steps.map((step, idx) => (
                <div key={`step-${idx}`} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Langkah {idx + 1}</p>
                    <Button size="sm" variant="outline" onClick={() => removeRegistrationStep(idx)} leftIcon={<Trash2 className="w-3.5 h-3.5" />}>
                      Hapus
                    </Button>
                  </div>
                  <Input label="Judul" value={step.title} onChange={(e) => updateRegistrationStep(idx, 'title', e.target.value)} />
                  <Textarea
                    label="Deskripsi"
                    value={step.description}
                    onChange={(e) => updateRegistrationStep(idx, 'description', e.target.value)}
                    rows={2}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Footer</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Konten kontak dan informasi tambahan.</p>
              </div>
              <Button size="sm" variant="outline" onClick={addInfoLink} leftIcon={<Plus className="w-4 h-4" />}>
                Tambah Link Info
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Judul Footer" value={content.footer.about_title} onChange={(e) => updateFooter('about_title', e.target.value)} />
              <Input label="Instagram URL" value={content.footer.instagram_url} onChange={(e) => updateFooter('instagram_url', e.target.value)} />
              <Input label="YouTube URL" value={content.footer.youtube_url} onChange={(e) => updateFooter('youtube_url', e.target.value)} />
            </div>
            <Textarea
              label="Deskripsi Footer"
              value={content.footer.about_text}
              onChange={(e) => updateFooter('about_text', e.target.value)}
              rows={3}
            />

            <div className="space-y-4">
              {content.footer.info_links.map((link, idx) => (
                <div key={`info-${idx}`} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Link {idx + 1}</p>
                    <Button size="sm" variant="outline" onClick={() => removeInfoLink(idx)} leftIcon={<Trash2 className="w-3.5 h-3.5" />}>
                      Hapus
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input label="Label" value={link.label} onChange={(e) => updateInfoLink(idx, 'label', e.target.value)} />
                    <Input label="URL" value={link.href} onChange={(e) => updateInfoLink(idx, 'href', e.target.value)} />
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Kontak</h4>
              <Input
                label="Link Google Maps"
                value={content.footer.contact.map_url}
                onChange={(e) =>
                  setContent((prev) => ({
                    ...prev,
                    footer: {
                      ...prev.footer,
                      contact: {
                        ...prev.footer.contact,
                        map_url: e.target.value,
                      },
                    },
                  }))
                }
              />
              <div className="space-y-3">
                {content.footer.contact.lines.map((line, idx) => (
                  <div key={`contact-${idx}`} className="flex flex-col md:flex-row gap-2 md:items-center">
                    <Input
                      label={`Baris ${idx + 1}`}
                      value={line}
                      onChange={(e) => updateContactLine(idx, e.target.value)}
                    />
                    <Button size="sm" variant="outline" onClick={() => removeContactLine(idx)} leftIcon={<Trash2 className="w-3.5 h-3.5" />}>
                      Hapus
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addContactLine} leftIcon={<Plus className="w-4 h-4" />}>
                  Tambah Baris Kontak
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}>
              {saving ? 'Menyimpan...' : 'Simpan Konten'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
