import { create } from 'zustand';

export interface DraftPhoto {
  uri: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface DraftLocation {
  lat: number;
  lng: number;
  address: string;
  inside: boolean;
}

export interface Draft {
  photo: DraftPhoto | null;
  categoryId: string | null;
  description: string;
  location: DraftLocation | null;
}

interface DraftState extends Draft {
  /** Set when a step was opened from «Editar» on the review step, so «Continuar» goes back there. */
  editingFromReview: boolean;
  setPhoto: (photo: DraftPhoto | null) => void;
  setDetails: (categoryId: string, description: string) => void;
  setLocation: (location: DraftLocation | null) => void;
  setEditingFromReview: (value: boolean) => void;
  reset: () => void;
}

const EMPTY: Draft & { editingFromReview: boolean } = {
  photo: null,
  categoryId: null,
  description: '',
  location: null,
  editingFromReview: false,
};

/**
 * The occurrence being reported. Kept outside the screens so going back and forth between the
 * steps, or a failed submission, never loses what was filled in.
 */
export const useDraft = create<DraftState>()((set) => ({
  ...EMPTY,
  setPhoto: (photo) => set({ photo }),
  setDetails: (categoryId, description) => set({ categoryId, description }),
  setLocation: (location) => set({ location }),
  setEditingFromReview: (editingFromReview) => set({ editingFromReview }),
  reset: () => set(EMPTY),
}));

/** True when something was filled in, so closing the wizard needs a confirmation (D1). */
export function hasDraftContent(d: Draft): boolean {
  return Boolean(d.photo || d.categoryId || d.description.trim() || d.location);
}
