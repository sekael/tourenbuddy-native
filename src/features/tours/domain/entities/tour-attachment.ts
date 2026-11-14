import type { AllowedMimeType } from '@/features/tours/data/models/tour-attachment';

/** Domain entity for a tour attachment. */
export interface TourAttachment {
  id: string;
  tourId: string;
  userId: string;
  storagePath: string;
  mimeType: AllowedMimeType;
  sizeBytes: number;
  originalFilename: string;
  sortOrder: number;
  createdAt: Date;
}
