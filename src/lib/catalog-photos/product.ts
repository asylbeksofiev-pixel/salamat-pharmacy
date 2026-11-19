/** A product of public.pharmacy_products as the photo pipeline sees it (id is unique; the article may repeat). */
export interface ProductRef {
  id: string;
  article: string | null;
  name: string;
  /** Current pharmacy_products.image_url (null/empty = no photo yet). */
  imageUrl?: string | null;
  /** Catalogue section slug, when known (for reports only). */
  category?: string | null;
}
