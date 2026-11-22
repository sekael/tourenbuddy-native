/** A contact method to add — the input shape shared by the store and UI. */
export interface NewContactMethod {
  methodType: 'phone' | 'email';
  value: string;
  label?: string | null;
  isPrimary?: boolean;
}
