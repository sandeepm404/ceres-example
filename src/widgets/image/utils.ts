/*
  Image widget utilities (Ceres)

  Ceres never optimizes/compresses images. Unlike Lydia (which uses
  getOptimizedImage / getSrcSet from @refrens/birds), here we pass the direct
  image link that comes from the Serana response straight into <img src="...">.
  Those birds helpers are intentionally NOT used in Ceres.

  These helpers only normalize the incoming shape (string | { url } | { src })
  into a plain, safe list of direct image URLs so the Handlebars partials can
  render them consistently anywhere in a template.
*/

/** An image value as it may appear in the Serana response. */
export type ImageInput =
  | string
  | { url?: unknown; src?: unknown }
  | null
  | undefined;

/** A single image ready to render. `href` is empty when linking is disabled. */
export interface NormalizedImage {
  src: string;
  href: string;
  alt: string;
}

export interface GalleryOptions {
  /** alt text applied to every image in the gallery */
  alt?: string;
  /** when true (default) each image links to its own full-size URL in a new tab */
  link?: boolean;
}

export interface ImageGalleryPayload {
  hasImages: boolean;
  images: NormalizedImage[];
  /** style variant, drives the container class (e.g. "thumbnail" | "original") */
  variant: string;
}

/**
 * Extract a usable direct image URL from a single image entry.
 * Accepts a plain string, or an object carrying `url` / `src`.
 * Returns null when nothing renderable is present.
 * @param input
 */
export function toImageSrc(input: ImageInput): string | null {
  const isSafe = (url: string) => !/^(?:javascript|vbscript|file):/i.test(url);

  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 && isSafe(trimmed) ? trimmed : null;
  }

  if (input && typeof input === "object") {
    let candidate: string | null = null;

    if (typeof input.url === "string") {
      candidate = input.url;
    } else if (typeof input.src === "string") {
      candidate = input.src;
    }

    if (candidate) {
      const trimmed = candidate.trim();
      return trimmed.length > 0 && isSafe(trimmed) ? trimmed : null;
    }
  }

  return null;
}

/**
 * Normalize an arbitrary array of image entries into renderable images.
 * Non-array input yields an empty list. Empty/invalid entries are dropped.
 * @param images
 * @param options
 */
export function normalizeImages(
  images: unknown,
  options: GalleryOptions = {}
): NormalizedImage[] {
  if (!Array.isArray(images)) {
    return [];
  }

  const alt = typeof options.alt === "string" ? options.alt : "";
  // Link to the full image by default (matches Lydia's line-item behaviour).
  const link = options.link !== false;

  return images
    .map((image) => toImageSrc(image as ImageInput))
    .filter((src): src is string => src !== null)
    .map((src) => ({ src, href: link ? src : "", alt }));
}

/**
 * Build the payload consumed by the CeresImageGallery partial.
 * @param images
 * @param options
 */
/** Allowed values for `variant` — anything else falls back to "default" rather than being interpolated as-is into a CSS class name. */
const ALLOWED_GALLERY_VARIANTS = ["thumbnail", "original", "default"];

export function prepareImageGallery(
  images: unknown,
  options: GalleryOptions & { variant?: string } = {}
): ImageGalleryPayload {
  const normalized = normalizeImages(images, options);
  const requestedVariant =
    typeof options.variant === "string" ? options.variant.trim() : "";
  const variant = ALLOWED_GALLERY_VARIANTS.includes(requestedVariant)
    ? requestedVariant
    : "default";

  return {
    hasImages: normalized.length > 0,
    images: normalized,
    variant,
  };
}
