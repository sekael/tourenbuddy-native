/** Unified domain entity combining user_profile table data with auth.users data. */
export interface FullUserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phoneNumber: string | null;
  phoneVerified: boolean;
}
