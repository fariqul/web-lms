export interface FacilityPhoto {
  id: number;
  path: string;
  position: number;
}

export interface Facility {
  id: number;
  name: string;
  description?: string | null;
  display_order: number;
  is_active: boolean;
  photos: FacilityPhoto[];
}

export interface FacilityPayload {
  name: string;
  description?: string;
  display_order?: number;
  is_active: boolean;
}
