# Ecommerce Hero Slides (Homepage)

This project exposes a **public** endpoint that returns the homepage hero carousel slides, and a **backoffice** page/API to manage them.

## 1) Run / enable

1. Apply DB migration (you already did):
   - `npm run db:migrate` (or `npm run db:migrate:one <file>`)

2. Restart the backend (important)
   - If the backend was already running before adding the public bypass, it will still behave like the old code.
   - Stop the backend (`Ctrl+C`) and restart:
     - Backend only: `npm run server`
     - Frontend + backend: `npm run dev:full`

3. Quick sanity check

- Health:
  - `GET http://localhost:3001/api/health`

- Public slides (must NOT require token):
  - `GET http://localhost:3001/api/hero-slides?locale=fr&limit=4`

If you see `{"message":"Token manquant"}` it means the backend process wasn’t restarted.

---

## 2) Public API (used by ecommerce frontend)

### Endpoint

`GET /api/hero-slides`

### Query params

- `locale` (required): `fr` | `ar`
- `limit` (optional): default `4`, max `8`
- `now` (optional): ISO datetime for preview/testing schedule

Example:

`GET /api/hero-slides?locale=fr&limit=4`

### Response shape (summary)

```json
{
  "locale": "fr",
  "generated_at": "2026-01-26T19:17:52.582Z",
  "slides": [
    {
      "id": "hs_123",
      "type": "category",
      "status": "published",
      "priority": 10,
      "schedule": { "starts_at": null, "ends_at": null },
      "media": { "image_url": "https://...", "image_alt": "..." },
      "content": { "title": "...", "subtitle": "..." },
      "target": { "category_id": 5 },
      "cta": {
        "primary": { "label": "Voir" },
        "secondary": { "label": "Découvrir" }
      }
    }
  ]
}
```

### Eligibility rules (server-side)

- Only `status = published`
- Schedule window is applied (`starts_at/ends_at`)
- CTA rules are enforced (max 2, primary/secondary labels)
- For `type=product`: product must exist, be published, not deleted, and be in-stock (product stock or variant stock)

---

## 3) Ecommerce frontend usage (recommended pattern)

### Fetch example (TypeScript)

```ts
type HeroSlidesResponse = {
  locale: "fr" | "ar";
  generated_at: string;
  slides: Array<{
    id: string;
    type: "category" | "brand" | "campaign" | "product";
    priority: number;
    schedule: { starts_at: string | null; ends_at: string | null };
    media: { image_url: string; image_alt: string | null };
    content: { title: string; subtitle: string | null };
    target: Record<string, number>;
    cta: {
      primary?: { label: string };
      secondary?: { label: string };
    };
  }>;
};

export async function fetchHeroSlides(locale: "fr" | "ar", limit = 4) {
  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
  const res = await fetch(
    `${API_BASE}/hero-slides?locale=${locale}&limit=${limit}`,
  );
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as HeroSlidesResponse;
}
```

### Rendering guidance

- Use `slide.media.image_url` as the image.
- Use `slide.content.title/subtitle` as text overlay.
- Use `slide.cta.primary` / `slide.cta.secondary` to render up to 2 buttons.
  - The ecommerce frontend derives navigation from `slide.type` + `slide.target`.
- Use `slide.target` to implement click behavior if you want “click on slide” navigation (optional).

---

## 4) Backoffice management

### UI page

- Open backoffice and go to:
  - `/hero-slides`

Roles allowed:

- `PDG`, `Manager`, `ManagerPlus`

### Admin API

Base:

- `/api/admin/hero-slides`

Requires employee JWT:

- `Authorization: Bearer <token>`

Routes:

- `GET /api/admin/hero-slides?locale=fr&status=published`
- `POST /api/admin/hero-slides` (PDG only)
- `PUT /api/admin/hero-slides/:id` (PDG only)
- `DELETE /api/admin/hero-slides/:id` (PDG only)

Notes:

- Targets are required depending on `type`:
  - `category` → `category_id`
  - `brand` → `brand_id`
  - `campaign` → `campaign_id`
  - `product` → `product_id` (optional `variant_id`)

### Upload image (recommended)

Create/update supports `multipart/form-data` with an uploaded image.

Field name:

- `image` (file) — required on create (unless you still provide `image_url`)

Example (curl):

`POST /api/admin/hero-slides`

```bash
curl -X POST "http://localhost:3001/api/admin/hero-slides" \
  -H "Authorization: Bearer <EMPLOYEE_TOKEN>" \
  -F "locale=fr" \
  -F "status=published" \
  -F "type=category" \
  -F "priority=10" \
  -F "title=Nouvelle promo" \
  -F "subtitle=Jusqu'à -30%" \
  -F "category_id=5" \
  -F "ctas=[{\"label\":\"Voir\",\"style\":\"primary\"}]" \
  -F "image=@./my-slide.jpg"
```

The backend stores the file under:

- `/uploads/hero_slides/<filename>`
