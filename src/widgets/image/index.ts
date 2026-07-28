/*
  Image widget for Ceres (Handlebars)

  Provides reusable image rendering for templates. Unlike Lydia, Ceres does NOT
  optimize/compress images (no getOptimizedImage / getSrcSet from @refrens/birds):
  the direct image URL from the Serana response is passed straight into <img src>.

  Registers:
    - Partial  CeresImage         → a single reusable image (linkable)
    - Partial  CeresImageGallery  → a row/grid of images built from an array
    - Helper   prepareImageGallery → normalizes an array of images into a gallery payload

  Usage in a template:
    {{> CeresImage src=logo alt="Logo" width="120"}}
    {{> CeresImageGallery (prepareImageGallery item.images variant="thumbnail" alt=name) }}
    {{> CeresImageGallery (prepareImageGallery item.originalImages variant="original" alt=name) }}
*/

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - compiled via handlebars-loader
import ceresImage from "./CeresImage.hbs";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - compiled via handlebars-loader
import ceresImageGallery from "./CeresImageGallery.hbs";
import "./styles.css";
import { prepareImageGallery } from "./utils";

function getHB(): any {
  return (window as any).Handlebars;
}

function register(): void {
  const HB = getHB();
  if (!HB) return;

  HB.registerHelper(
    "prepareImageGallery",
    function (images: unknown, options: any) {
      const hash = options?.hash || {};
      // link defaults to true; pass link=false (bare boolean) to render plain
      // (non-linked) images. A quoted "false" string is also accepted.
      const linkDisabled = hash.link === false || hash.link === "false";
      return prepareImageGallery(images, {
        variant: hash.variant,
        alt: hash.alt,
        link: !linkDisabled,
      });
    }
  );

  HB.registerPartial("CeresImage", ceresImage);
  HB.registerPartial("CeresImageGallery", ceresImageGallery);

  (window as any).CeresWidgets = (window as any).CeresWidgets || {};
  (window as any).CeresWidgets.Image = { register };
}

try {
  register();
} catch (error) {
  console.error("Image widget registration failed:", error);
}

export {};
