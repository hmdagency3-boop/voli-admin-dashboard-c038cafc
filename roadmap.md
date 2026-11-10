# Unified bans
- [x] Update both device-report SQL definitions with client IP fallback and a compatible six-argument overload; all 25 isolated PostgreSQL tests passed.
- [x] Add owner-run SQL for unified codes, existing account bans, device-linked account enforcement and ID/device history lookup.
- [x] Add dedicated bans page; keep device history separate and link member actions to bans.
- [x] Add and run rule tests; 21 tests passed, isolated SQL and UI fixtures verified. Real signed-out redirect verified.
- [x] Document external database/app activation requirements in sql/016_README.md.
- [ ] Activate on Voli database: requires owner to run sql/016_unified_bans.sql.
- [ ] Verify real member enforcement and device reports: requires the separate Voli app integration and real admin session; unavailable in this standalone console.
# Name / picture violations
- [x] SQL 017: remove name (voli+ID) or picture, Voli Helper warning, timed/permanent change locks enforced by trigger.
- [x] Member page buttons, lock removal, log labels, tests.
- [ ] Activate on Voli database: requires owner to run sql/017_profile_moderation.sql.
# Video gifts
- [x] SQL 019: video_url on gifts, admin_set_gift_video, 5-argument admin_create_gift, admin_gifts returns video.
- [x] Panel: add gift with video, add/change/link/remove video, preview, filter, log labels, tests.
- [ ] Activate on Voli database: requires owner to run sql/019_gift_videos.sql.
- [ ] Play the video after sending a gift: requires the separate Voli app to read video_url.
# Store and backpack
- [x] SQL 023: items (frames, rides, styles, price, days, picture, video), backpack with day top-ups, buy and wear one per kind, admin grant/remove; 14 isolated database tests passed.
- [x] Panel: Store page (add, edit, hide, picture, video, sales) and member backpack with grant/remove; 6 rule tests; page checked with sample data.
- [ ] Activate on Voli database: requires owner to run sql/023_store.sql.
- [ ] Store and Backpack screens in the Voli app: separate project; request ready in sql/023_README.md.
