export type LandingCta = {
  label: string;
  href: string;
};

export type LandingHero = {
  subtitle: string;
  title: string;
  description: string;
  cta_primary: LandingCta;
  cta_secondary: LandingCta;
  logo_url?: string | null;
  background_url?: string | null;
  video_url?: string | null;
};

export type LandingAboutCard = {
  icon: string;
  title: string;
  text: string;
};

export type LandingAbout = {
  label: string;
  title: string;
  description: string;
  cards: LandingAboutCard[];
};

export type LandingProgramItem = {
  title: string;
  description: string;
};

export type LandingPrograms = {
  label: string;
  title: string;
  description: string;
  items: LandingProgramItem[];
};

export type LandingFacilities = {
  label: string;
  title: string;
  description: string;
};

export type LandingRegistrationStep = {
  title: string;
  description: string;
};

export type LandingRegistration = {
  label: string;
  title: string;
  description: string;
  steps: LandingRegistrationStep[];
  cta_label: string;
  cta_href: string;
};

export type LandingFooterLink = {
  label: string;
  href: string;
};

export type LandingFooterContact = {
  map_url: string;
  lines: string[];
};

export type LandingFooter = {
  about_title: string;
  about_text: string;
  instagram_url: string;
  youtube_url: string;
  info_links: LandingFooterLink[];
  contact: LandingFooterContact;
};

export type LandingContent = {
  hero: LandingHero;
  about: LandingAbout;
  programs: LandingPrograms;
  facilities: LandingFacilities;
  registration: LandingRegistration;
  footer: LandingFooter;
};
