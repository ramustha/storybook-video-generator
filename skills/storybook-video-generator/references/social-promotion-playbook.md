# Bilingual Social Promotion & Audience Growth Playbook

This playbook establishes the cross-platform promotion methodology for children's storybooks. Whenever a video is rendered and published, creators must execute the **"Single Post, Dual Language"** promotion strategy across Instagram, Facebook, YouTube Community, and TikTok to attract new viewers, maximize engagement, and drive algorithmic discovery.

---

## 1. Audience Psychology & Growth Fundamentals

### Why "Single Post, Dual Language" Works
1. **Bilingual Parenting Demand**: Parents across Southeast Asia actively seek English read-alouds paired with Bahasa Indonesia translations for early childhood linguistic development (*"anak bilingual"*).
2. **Global Diaspora Retention**: Indonesian diaspora families living in North America, Europe, Australia, and the Middle East rely on bilingual storybooks so children stay fluent in Indonesian while living in an English-speaking environment.
3. **Algorithmic Ranking Factors**:
   - **Saves & Bookmarks (No. 1 Ranker on Instagram & TikTok)**: Parents save storybook posts with *"Save this for tonight's bedtime reading!"*. High save rates signal immense value to social algorithms, triggering explore-feed velocity.
   - **Comments & Discussion (No. 1 Ranker on Facebook & YouTube)**: Posts that ask a relatable question about toddler humor or bedtime struggles generate active parent conversations in the comment section.

---

## 2. The "Double Hook & Engagement Spark" Copywriting Formula

Every social promotion post must follow this 7-step architecture:

```
[Visual Asset: 5-Slide Carousel / High-CTR Thumbnail]

✨ DONGENG CERITA ANAK BARU! 📖 / NEW ANIMATED STORYBOOK! ✨
------------------------------------------------------------
🇮🇩 BAHASA INDONESIA:
[Hook: Relatable childhood or parenting conflict + curiosity gap]
[2-Sentence Narrative Teaser: Emphasizing humor, wonder, or excitement]
💡 Pesan Moral:
"[Clear, warm, non-preachy moral takeaway from the closing scene]"

💬 PERTANYAAN UNTUK BUNDA & AYAH (Engagement Spark):
[Relatable question asking parents to share their child's habits or funny stories]

------------------------------------------------------------
🇺🇸 ENGLISH:
[Hook: International curiosity hook]
[2-Sentence Narrative Teaser in natural, joyful English]
💡 Moral of the Story:
"[Direct English translation of moral takeaway]"

💬 QUESTION FOR PARENTS & EDUCATORS:
[Bilingual prompt inviting comments from international viewers]

------------------------------------------------------------
🎬 WATCH THE FULL WIDESCREEN VIDEO:
📺 YouTube: [Direct Link / Link in Bio]
⭐ Simpan postingan ini untuk dongeng malam nanti! / Save for bedtime tonight! 💾✨

[Dual-Corpus Hashtags: Indonesian Parenting + Global Read-Aloud]
```

---

## 3. Platform-by-Platform Execution Blueprint

### 📸 A. Instagram (Feed Carousel + Reel + Story)
* **Feed Carousel Blueprint (5 Slides)**:
  * **Slide 1**: Hero Cover with Hook Sticker (`thumbnail-popular.png` or 1:1 square crop).
  * **Slide 2**: Climactic or Funny Scene Still (e.g. Scene 4/5).
  * **Slide 3**: Resolution / Emotional Scene Still (e.g. Scene 7/8).
  * **Slide 4**: Dedicated Moral Card (`type: "moral"` frame from `MoralScene.tsx`).
  * **Slide 5**: CTA Slide: *"Tonton Dongeng Lengkapnya di YouTube @ZaynStorybook! 🔔 Link di Bio!"*.
* **Reel Caption**: Use the bilingual teaser copy with a prompt to visit the full 16:9 widescreen master on YouTube.
* **Story Strategy**: Share the Reel / Carousel to Stories with an interactive Poll sticker: *"Sudah baca dongeng ini belum? (Sudah! 🌟 / Mau nonton bareng si kecil! 💖)"* and a Link Sticker pointing to YouTube.

### 📘 B. Facebook Page (Community Feed & Parenting Groups)
* **Visual Asset**: Direct 1920×1080 `thumbnail-popular.png` or link preview of the 16:9 master video.
* **Copy Focus**: Focus on family values, screen-time peace of mind, and the moral takeaway.
* **Discussion Question**: Ask open-ended questions: e.g. *"Bagaimana cara Ayah & Bunda menanamkan rasa ikhlas/kejujuran kepada si kecil di rumah? Tulis tips terbaik Anda di komentar ya! 👇"*.

### 🔴 C. YouTube Community Tab (Interactive Poll & Announcement)
* **Format**: Image Poll featuring 4 scene stills or single 16:9 Widescreen Announcement Card.
* **Copy**:
  ```text
  🎉 CERITA BARU SUDAH TAYANG! / NEW STORYBOOK IS LIVE! 📖✨
  Kira-kira, adegan mana yang paling bikin kalian tertawa atau penasaran?
  1. 🧢 Saat topi tertiup angin kencang
  2. 🌙 Waktu bulan tiba-tiba memakai topi
  3. 💖 Saat senyuman kembali merekah bersama keluarga
  4. ✨ Semua adegannya seru dan menggemaskan!
  Tulis alasanmu di komentar ya! Tonton video lengkapnya di sini: [YouTube Link]
  ```

### 🎵 D. TikTok & Threads / X (Fast Curiosity Hook)
* Keep copy under 150–200 characters:
  ```text
  Topi kesayangan hilang tertiup angin... kok malah dipakai bulan?! 🌙🧢 Tonton cerita lengkap "Bulan dan Topi Biru" di YouTube Zayn Storybook! Link di bio! #DongengAnak #CeritaLucu #BedtimeStory
  ```

---

## 4. Automated Generation via CLI

The project provides an automated generator that parses `story.json` (title, original title, moral scene text, thumbnail hooks, and live publication URLs) to produce a copy-paste ready package:

```bash
# Generate bilingual social promotion package for a specific story:
npm run promo:social -- <book-slug>

# Outputs to:
stories/<book-slug>/exports/social-promotion-posts.md
```

### Automatic Pipeline Integration:
When running the master distribution command:
```bash
npm run publish:all -- --book <book-slug>
```
The pipeline automatically invokes `generate-social-promo.ts` upon publication, ensuring creators immediately have social copy ready for deployment.
