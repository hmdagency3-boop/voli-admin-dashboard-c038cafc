<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- This is Voli's standalone admin console: it talks to Voli's database only through the admin_* database functions (role-checked there), never with a secret key — rules stay in Voli's database.
- Gift pictures are uploaded straight to Voli's public `gift-art` storage bucket (write policy checks the admin role in the database), then saved through admin_create_gift / admin_set_gift_art; the database change ships as sql/013_gift_uploads.sql, run by the owner in Voli's SQL Editor, because this panel cannot change Voli's schema.
- UI is Ant Design + Pro Components, Arabic RTL, rendered client-only after hydration (private tool, avoids antd SSR styling issues).
- Official English congratulation notices (Voli Helper, ID 100) are written inside the admin_* grant functions in Voli's database (sql/014_admin_grant_notices.sql), never sent again from the panel, so each grant produces exactly one set of messages; src/lib/admin.ts mirrors the same wording only for previews and hand-sent notices (admin_send_notice).
- Unified bans use an owner-run registry upgrade with independent account-source links and an effective member_bans projection; this preserves original Voli sign-in enforcement and legacy read contracts while preventing one unban from clearing other sources.
- Ban mutations live on the dedicated bans page; device/member views link there so every mutation uses the same role-checked registry RPCs.
- Device-report SQL keeps defaults only on the legacy six-argument wrapper and requires all seven arguments on the client-IP implementation, because overlapping defaults make PostgreSQL calls ambiguous.
- Gift pictures and videos upload from the browser to Voli's Cloudinary cloud through the unsigned preset (no secret in the panel); the database only accepts links from that cloud (gift_art_ok / gift_video_ok, sql/018 and sql/019). Removing a video only detaches it from the gift, because deleting Cloudinary files needs a signed secret the panel must not hold. New gifts are created with the 4-argument admin_create_gift and the video attached afterwards via admin_set_gift_video, so the panel works whichever create overloads the API exposes; owner SQL files end with `notify pgrst, 'reload schema'` so new functions are visible immediately.
- Store and backpack live in owner-run sql/023_store.sql: store_items is member-readable, member_items shows members their own rows plus what others wear now, purchases are closed; buying/wearing go through store_buy/store_equip and the panel only uses role-checked admin_*store* functions (src/lib/store.ts), so prices and days stay enforced in the database. Store media uses its own Cloudinary folders and store_art_ok/store_video_ok checks.
- Soft (feathered) edges for store videos and entrance pictures are made in the admin's browser before upload (src/lib/video-edges.ts: canvas mask + MediaRecorder WebM with alpha; src/lib/image-edges.ts: square PNG), so no server, secret or database change is needed; videos may still upload as is, entrance pictures only when already square.
- A gift or entrance picture can be taken from a frame of its video (src/components/VideoFramePicker.tsx), always followed by the square/soft-edge adjust step; uploaded Cloudinary videos are read with crossOrigin=anonymous so the frame can be captured in the browser.
