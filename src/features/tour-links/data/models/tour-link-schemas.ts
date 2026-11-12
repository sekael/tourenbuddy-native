import { z } from 'zod';

/** Row from `tour_link_group`. */
export const tourLinkGroupRowSchema = z
  .object({
    id: z.string(),
    created_at: z.string(),
  })
  .transform((row) => ({ id: row.id, createdAt: new Date(row.created_at) }));

export type TourLinkGroup = z.infer<typeof tourLinkGroupRowSchema>;

/** Row from `tour_link_member`. */
export const tourLinkMemberRowSchema = z
  .object({
    group_id: z.string(),
    tour_id: z.string(),
    joined_at: z.string(),
  })
  .transform((row) => ({
    groupId: row.group_id,
    tourId: row.tour_id,
    joinedAt: new Date(row.joined_at),
  }));

export type TourLinkMember = z.infer<typeof tourLinkMemberRowSchema>;

export const tourLinkRequestStatusSchema = z.enum(['pending', 'accepted', 'declined', 'withdrawn']);

export type TourLinkRequestStatus = z.infer<typeof tourLinkRequestStatusSchema>;

/** Row from `tour_link_request`. */
export const tourLinkRequestRowSchema = z
  .object({
    id: z.string(),
    initiator_tour_id: z.string(),
    target_tour_id: z.string(),
    status: tourLinkRequestStatusSchema,
    created_at: z.string(),
    resolved_at: z.string().nullable(),
  })
  .transform((row) => ({
    id: row.id,
    initiatorTourId: row.initiator_tour_id,
    targetTourId: row.target_tour_id,
    status: row.status,
    createdAt: new Date(row.created_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
  }));

export type TourLinkRequest = z.infer<typeof tourLinkRequestRowSchema>;
