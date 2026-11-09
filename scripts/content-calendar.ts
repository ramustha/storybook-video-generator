import fs from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { execSync, spawn } from "child_process";
import { notifyTelegramFailure } from "./notify-telegram";

export interface ScheduledSlot {
  date?: string; // "YYYY-MM-DD" e.g. "2026-11-07"
  dayName: "Senin" | "Selasa" | "Rabu" | "Kamis" | "Jumat" | "Sabtu" | "Minggu";
  timeSlot: string; // e.g. "19:00 WIB"
  slotType: string;
  bookSlug: string;
  lang: "id" | "en";
  format: "landscape" | "vertical" | "both";
  targetPlatforms: string[];
  theme: string;
}

export const DAILY_CALENDAR_MONTH_1: ScheduledSlot[] = [
  {
    date: "2026-11-07",
    dayName: "Sabtu",
    timeSlot: "19:30 WIB",
    slotType: "Prime Bedtime Story (Grand Launch Cerita Baru #1)",
    bookSlug: "terlalu-banyak-suara",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Sringeri Srinivas #3: Lelucon Klakson Jalan Raya, Sapi Mogok & Headphone Ajaib",
  },
  {
    date: "2026-11-07",
    dayName: "Sabtu",
    timeSlot: "21:00 WIB",
    slotType: "Bilingual English Bedtime Feature (Grand Launch Cerita Baru #2)",
    bookSlug: "terlalu-banyak-suara",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Too Much Noise! & Sringeri Srinivas Whimsical Solitude",
  },
  {
    date: "2026-11-08",
    dayName: "Minggu",
    timeSlot: "08:30 WIB",
    slotType: "Morning Energy & English Read-Aloud",
    bookSlug: "topsy-turvy-serba-terbalik",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Topsy Turvy - Upside Down Magic Bedroom!",
  },
  {
    date: "2026-11-08",
    dayName: "Minggu",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "topsy-turvy-serba-terbalik",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Semua Serba Terbalik! Kisah Jenaka Kamar Jungkir Balik & Pesulap Cilik",
  },
  {
    date: "2026-11-09",
    dayName: "Senin",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "kacamata-nenek",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Grandma's Glasses & The Great Spectacles Hunt",
  },
  {
    date: "2026-11-09",
    dayName: "Senin",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "kacamata-nenek",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Misteri Kacamata Nenek yang Hilang & Kasih Sayang Cucu",
  },
  {
    date: "2026-11-10",
    dayName: "Selasa",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "jangan-sekarang",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Not Now, Not Now! Learning Patience & Family Warmth",
  },
  {
    date: "2026-11-10",
    dayName: "Selasa",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "jangan-sekarang",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Jangan Sekarang, Tunggu Dulu! Belajar Sabar Menanti Kejutan Indah",
  },
  {
    date: "2026-11-11",
    dayName: "Rabu",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "dengarkan-tubuhku",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Listen to My Body! A Mindful Heartbeat Journey",
  },
  {
    date: "2026-11-11",
    dayName: "Rabu",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "dengarkan-tubuhku",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Mendengarkan Tubuhku! Mengenal Bunyi Ajaib dan Detak Jantung Diri Sendiri",
  },
  {
    date: "2026-11-12",
    dayName: "Kamis",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "di-bawah-tempat-tidurku",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Under My Bed! Conquering Silly Nighttime Shadows",
  },
  {
    date: "2026-11-12",
    dayName: "Kamis",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "di-bawah-tempat-tidurku",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Ada Harimau di Bawah Tempat Tidurku! Kisah Jenaka Menghadapi Rasa Takut",
  },
  {
    date: "2026-11-13",
    dayName: "Jumat",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "tersenyumlah",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Smile Please! A Sweet Forest Smile Journey",
  },
  {
    date: "2026-11-13",
    dayName: "Jumat",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "tersenyumlah",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Tersenyumlah! Hangatnya Senyum Sahabat Rimba",
  },
  {
    date: "2026-11-14",
    dayName: "Sabtu",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "kue-ulang-tahun-untuk-mimi",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: A Birthday Cake for Mimi (Baking Joy & Friendship)",
  },
  {
    date: "2026-11-14",
    dayName: "Sabtu",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "kue-ulang-tahun-untuk-mimi",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Kue Ulang Tahun untuk Mimi (Keseruan Dapur & Cinta Sahabat)",
  },
  {
    date: "2026-11-15",
    dayName: "Minggu",
    timeSlot: "08:30 WIB",
    slotType: "Morning Energy Short",
    bookSlug: "tersenyumlah",
    lang: "id",
    format: "vertical",
    targetPlatforms: ["YouTube Shorts", "Instagram Reels", "Facebook Reels"],
    theme: "Morning Joy Short: Hewan Hutan Bergembira & Belajar Tersenyum",
  },
  {
    date: "2026-11-15",
    dayName: "Minggu",
    timeSlot: "19:30 WIB",
    slotType: "Mega Bedtime Marathon",
    bookSlug: "kompilasi-keluarga-ceria",
    lang: "id",
    format: "landscape",
    targetPlatforms: ["YouTube Master (16:9)", "Facebook Watch"],
    theme: "Marathon 1: Kompilasi Kehangatan Rumah & Keluarga (~20m)",
  },
  {
    date: "2026-11-16",
    dayName: "Senin",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "sringeri-srinivas-belajar-tertawa",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Sringeri Srinivas Learns to Laugh",
  },
  {
    date: "2026-11-16",
    dayName: "Senin",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "sringeri-srinivas-belajar-tertawa",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Sringeri Srinivas Belajar Tertawa (Slapstick Monyet & Pisang)",
  },
  {
    date: "2026-11-17",
    dayName: "Selasa",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "baju-baru-sang-kodok",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: The Frog's New Clothes",
  },
  {
    date: "2026-11-17",
    dayName: "Selasa",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "baju-baru-sang-kodok",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Baju Baru Sang Kodok & Menerima Diri Apa Adanya",
  },
  {
    date: "2026-11-18",
    dayName: "Rabu",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "bima-tukang-tidur",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Bheema the Sleepyhead",
  },
  {
    date: "2026-11-18",
    dayName: "Rabu",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "bima-tukang-tidur",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Bima si Tukang Tidur (Banteng Raksasa Hobi Tidur Nyenyak)",
  },
  {
    date: "2026-11-19",
    dayName: "Kamis",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "payung-merah",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: The Red Umbrella (Wind, Rain, and Kindness)",
  },
  {
    date: "2026-11-19",
    dayName: "Kamis",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "payung-merah",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Payung Merah (Petualangan Terbang Sahabat Rimba di Musim Hujan)",
  },
  {
    date: "2026-11-20",
    dayName: "Jumat",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "bagaimana-jika",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: What If? A Joyful Bedtime Spark of Curiosity",
  },
  {
    date: "2026-11-20",
    dayName: "Jumat",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "bagaimana-jika",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Bagaimana Jika? Imajinasi Seru Rasa Ingin Tahu Anak",
  },
  {
    date: "2026-11-21",
    dayName: "Sabtu",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "siapa-mengambil-apelku",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Who Took My Apple? A Fun Animal Detective Tale",
  },
  {
    date: "2026-11-21",
    dayName: "Sabtu",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "siapa-mengambil-apelku",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Siapa yang Mengambil Apelku? Teka-teki Seru Jejak Hewan Kebun",
  },
  {
    date: "2026-11-22",
    dayName: "Minggu",
    timeSlot: "08:30 WIB",
    slotType: "Morning Energy Short",
    bookSlug: "siapa-mengambil-apelku",
    lang: "id",
    format: "vertical",
    targetPlatforms: ["YouTube Shorts", "Instagram Reels", "Facebook Reels"],
    theme: "Morning Short: Monyet & Apel Misterius di Kebun",
  },
  {
    date: "2026-11-22",
    dayName: "Minggu",
    timeSlot: "19:30 WIB",
    slotType: "Mega Bedtime Marathon",
    bookSlug: "kompilasi-fabel-hewan",
    lang: "id",
    format: "landscape",
    targetPlatforms: ["YouTube Master (16:9)", "Facebook Watch"],
    theme: "Marathon 2: Kompilasi 5 Fabel Rimba & Hewan Ceria (~20m)",
  },
  {
    date: "2026-11-23",
    dayName: "Senin",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "burung-gagak-cerdik",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: The Clever Crow (Problem Solving with Pebbles)",
  },
  {
    date: "2026-11-23",
    dayName: "Senin",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "burung-gagak-cerdik",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Burung Gagak yang Cerdik (Fabel Klasik Kecerdikan & Ketekunan)",
  },
  {
    date: "2026-11-24",
    dayName: "Selasa",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "katak-ingin-terbang",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: The Frog Who Wanted to Fly",
  },
  {
    date: "2026-11-24",
    dayName: "Selasa",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "katak-ingin-terbang",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Katak yang Ingin Terbang (Semangat Pantang Menyerah & Persahabatan)",
  },
  {
    date: "2026-11-25",
    dayName: "Rabu",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "awan-kecil-yang-haus",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: The Little Thirsty Cloud",
  },
  {
    date: "2026-11-25",
    dayName: "Rabu",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "awan-kecil-yang-haus",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Awan Kecil yang Haus (Perjalanan Membasahi Padang Bunga)",
  },
  {
    date: "2026-11-26",
    dayName: "Kamis",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "kupu-kupu-sayap-pelangi",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: The Butterfly with Rainbow Wings",
  },
  {
    date: "2026-11-26",
    dayName: "Kamis",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "kupu-kupu-sayap-pelangi",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Kupu-Kupu Sayap Pelangi (Keindahan Berbagi Warna di Taman)",
  },
  {
    date: "2026-11-27",
    dayName: "Jumat",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "milo-si-anak-gajah",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Milo The Little Elephant",
  },
  {
    date: "2026-11-27",
    dayName: "Jumat",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "milo-si-anak-gajah",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Milo Si Anak Gajah (Menemukan Keistimewaan Diri)",
  },
  {
    date: "2026-11-28",
    dayName: "Sabtu",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "layang-layang-kiki",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Kiki's Flying Kite",
  },
  {
    date: "2026-11-28",
    dayName: "Sabtu",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "layang-layang-kiki",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Layang-Layang Kiki yang Terbang Tinggi (Keceriaan Angin Sore)",
  },
  {
    date: "2026-11-29",
    dayName: "Minggu",
    timeSlot: "08:30 WIB",
    slotType: "Morning Energy Short",
    bookSlug: "kupu-kupu-sayap-pelangi",
    lang: "id",
    format: "vertical",
    targetPlatforms: ["YouTube Shorts", "Instagram Reels", "Facebook Reels"],
    theme: "Morning Short: Sayap Pelangi di Taman Bunga",
  },
  {
    date: "2026-11-29",
    dayName: "Minggu",
    timeSlot: "19:30 WIB",
    slotType: "Mega Bedtime Marathon",
    bookSlug: "kompilasi-dongeng-menenangkan",
    lang: "id",
    format: "landscape",
    targetPlatforms: ["YouTube Master (16:9)", "Facebook Watch"],
    theme: "Marathon 3: Kompilasi Petualangan Alam & Imajinasi Bintang (~20m)",
  },
  {
    date: "2026-11-30",
    dayName: "Senin",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "roti-canai-terbang",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: The Runaway Chapati (Kitchen Fun Comedy)",
  },
  {
    date: "2026-11-30",
    dayName: "Senin",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "roti-canai-terbang",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Roti Terbang yang Lari (Komedi Dapur Mengejar Roti Menggelinding)",
  },
  {
    date: "2026-12-01",
    dayName: "Selasa",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "kambing-dan-jembatan-sempit",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: The Two Goats (Cooperation & Kindness)",
  },
  {
    date: "2026-12-01",
    dayName: "Selasa",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "kambing-dan-jembatan-sempit",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Dua Kambing dan Jembatan Sempit (Pentingnya Mengalah & Kerja Sama)",
  },
  {
    date: "2026-12-02",
    dayName: "Rabu",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "burung-hantu-takut-gelap",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: The Owl Who Was Afraid of the Dark",
  },
  {
    date: "2026-12-02",
    dayName: "Rabu",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "burung-hantu-takut-gelap",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Burung Hantu Cilik yang Takut Gelap (Melihat Keindahan Bintang Malam)",
  },
  {
    date: "2026-12-03",
    dayName: "Kamis",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "sepatu-merah-kiki",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Red Shoes for Kiki",
  },
  {
    date: "2026-12-03",
    dayName: "Kamis",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "sepatu-merah-kiki",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Sepatu Merah Kiki (Kemandirian & Belajar Memakai Sepatu Baru)",
  },
  {
    date: "2026-12-04",
    dayName: "Jumat",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "ikan-emas-dan-sungai-ajaib",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: The Golden Fish (Free Swimming & Kindness)",
  },
  {
    date: "2026-12-04",
    dayName: "Jumat",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "ikan-emas-dan-sungai-ajaib",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Ikan Emas Berenang Bebas (Menyayangi Makhluk Hidup)",
  },
  {
    date: "2026-12-05",
    dayName: "Sabtu",
    timeSlot: "08:30 WIB",
    slotType: "Morning English Feature",
    bookSlug: "sahabat-di-atas-pohon",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Friends in the Trees",
  },
  {
    date: "2026-12-05",
    dayName: "Sabtu",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "sahabat-di-atas-pohon",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Prime Bedtime Story: Sahabat di Atas Pohon (Persahabatan Hangat Tupai & Burung Pipit)",
  },
  {
    date: "2026-12-06",
    dayName: "Minggu",
    timeSlot: "08:30 WIB",
    slotType: "Morning Energy Short",
    bookSlug: "sahabat-di-atas-pohon",
    lang: "id",
    format: "vertical",
    targetPlatforms: ["YouTube Shorts", "Instagram Reels", "Facebook Reels"],
    theme: "Morning Short: Parade Karakter Favorit Zayn Storybook",
  },
  {
    date: "2026-12-06",
    dayName: "Minggu",
    timeSlot: "19:30 WIB",
    slotType: "Grand Finale Mega Marathon",
    bookSlug: "kompilasi-bedtime-60m",
    lang: "id",
    format: "landscape",
    targetPlatforms: ["YouTube Master (16:9)", "Facebook Watch"],
    theme: "Grand Finale: 60 Menit Mega Dongeng Pengantar Tidur Zayn (~60m)",
  },
];

export const WEEKLY_SCHEDULE: ScheduledSlot[] = [
  {
    dayName: "Senin",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "gara-gara-kucing",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Cerita Humor & Tanggung Jawab Mengawali Pekan",
  },
  {
    dayName: "Selasa",
    timeSlot: "19:00 WIB",
    slotType: "Bilingual English Feature",
    bookSlug: "hari-cukur-rambut",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Read-Aloud: Overcoming Anxieties & Problem Solving",
  },
  {
    dayName: "Rabu",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "hari-cukur-rambut",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Cerita Jenaka Keberanian & Menghadapi Rasa Takut",
  },
  {
    dayName: "Kamis",
    timeSlot: "19:00 WIB",
    slotType: "Bilingual English Feature",
    bookSlug: "jas-hujan-merah",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "English Bedtime Story: Learning Patience & Joy of Waiting",
  },
  {
    dayName: "Jumat",
    timeSlot: "19:30 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "pisang-terlalu-banyak",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Kisah Jenaka Pak Srinivas: Mengubah Masalah Menjadi Dodol Manis & Berkah Bersama 🍌✨",
  },
  {
    dayName: "Sabtu",
    timeSlot: "08:30 WIB",
    slotType: "Morning Energy Short",
    bookSlug: "gara-gara-kucing",
    lang: "id",
    format: "vertical",
    targetPlatforms: ["Instagram Reels", "Facebook Reels", "YouTube Shorts", "TikTok"],
    theme: "Weekend Morning Ceria: Alasan Paling Lucu Nggak Bikin PR!",
  },
  {
    dayName: "Sabtu",
    timeSlot: "19:00 WIB",
    slotType: "Weekend Family Special",
    bookSlug: "raja-gemuk-anjing-kurus",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9)", "Facebook Watch (16:9)", "Instagram Reels"],
    theme: "Saturday Night Special: Fat King & Thin Dog Comedy",
  },
  {
    dayName: "Minggu",
    timeSlot: "09:00 WIB",
    slotType: "Weekend Family Special",
    bookSlug: "jas-hujan-merah",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook Watch", "Instagram Reels"],
    theme: "Minggu Pagi Santai: Kisah Kesabaran Menunggu Hujan",
  },
  {
    dayName: "Minggu",
    timeSlot: "14:00 WIB",
    slotType: "Bilingual English Feature",
    bookSlug: "pisang-terlalu-banyak",
    lang: "en",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Sunday Afternoon Read-Aloud: Too Many Bananas & The Sweet Halwa Surprise 🍌🎉",
  },
  {
    dayName: "Minggu",
    timeSlot: "19:00 WIB",
    slotType: "Prime Bedtime Story",
    bookSlug: "raja-gemuk-anjing-kurus",
    lang: "id",
    format: "both",
    targetPlatforms: ["YouTube (16:9 & Shorts)", "Facebook (Watch & Reels)", "Instagram Reels"],
    theme: "Kisah Persahabatan & Pola Hidup Sehat Menutup Akhir Pekan",
  },
];

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;

function getTodaySlot(targetDate?: string): ScheduledSlot[] {
  const now = new Date();
  const jakartaDateStr =
    targetDate ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

  const matchedDateSlots = DAILY_CALENDAR_MONTH_1.filter((s) => s.date === jakartaDateStr);
  if (matchedDateSlots.length > 0) {
    return matchedDateSlots;
  }

  const dayIndex = now.getDay(); // 0 is Sunday
  const todayName = DAYS_ID[dayIndex];
  return WEEKLY_SCHEDULE.filter((s) => s.dayName === todayName);
}

function checkPublicationStatus(bookSlug: string, lang: "id" | "en") {
  const storyPath = path.resolve("./stories", bookSlug, "story.json");
  if (!existsSync(storyPath)) {
    return { yt: false, fb: false, ig: false, ready: false };
  }

  try {
    const raw = readFileSync(storyPath, "utf-8");
    const story = JSON.parse(raw);
    const pub = story.publications || {};

    const yt = !!(pub.youtube?.[lang]?.landscape || pub.youtube?.[lang]?.vertical || story.exports?.[lang]?.landscape?.youtubeId);
    const fb = !!(pub.facebook?.[lang]?.landscape || pub.facebook?.[lang]?.vertical || (lang === "id" && pub.facebook?.landscape));
    const ig = !!(pub.instagram?.[lang] || (lang === "id" && pub.instagram?.id));

    return { yt, fb, ig, ready: true, title: story.title || bookSlug };
  } catch {
    return { yt: false, fb: false, ig: false, ready: false };
  }
}

function sendMacNotification(title: string, message: string, sound = "Glass") {
  try {
    const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(
      /"/g,
      '\\"'
    )}" sound name "${sound}"`;
    execSync(`osascript -e '${script}'`);
    return true;
  } catch (err: any) {
    console.warn("⚠️ Could not send macOS notification:", err.message);
    return false;
  }
}

function printHeader() {
  console.log("\n==================================================================");
  console.log("📅 ZAYN STORYBOOK: EDITORIAL BROADCAST & CONTENT CALENDAR");
  console.log("==================================================================");
}

async function showToday() {
  printHeader();
  const now = new Date();
  const todayName = DAYS_ID[now.getDay()];
  const dateStr = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  const timeStr = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now).replace(/\./g, ":");

  console.log(`📍 Hari Ini     : ${dateStr}`);
  console.log(`⏰ Waktu Jakarta : ${timeStr} WIB`);
  console.log("==================================================================\n");

  const todaySlots = getTodaySlot();

  if (todaySlots.length === 0) {
    console.log("🌴 Hari ini tidak ada jadwal rilis wajib. Hari bebas untuk riset atau batch render.");
    return;
  }

  console.log(`🎯 JADWAL TAYANG HARI INI (${todaySlots.length} Tayangan):`);

  todaySlots.forEach((slot, idx) => {
    const status = checkPublicationStatus(slot.bookSlug, slot.lang);
    console.log(`\n[Slot ${idx + 1}] ⏰ ${slot.timeSlot} — ${slot.slotType}`);
    console.log(`   📖 Judul Buku    : ${status.title || slot.bookSlug} (${slot.lang.toUpperCase()})`);
    console.log(`   🎨 Tema / Nilai   : ${slot.theme}`);
    console.log(`   📐 Format Tayang : ${slot.format.toUpperCase()}`);
    console.log(`   📱 Platform      : ${slot.targetPlatforms.join(", ")}`);
    console.log(`   📊 Status Rilis  :`);
    console.log(`      - YouTube     : ${status.yt ? "✔ PUBLISHED" : "⏳ PENDING"}`);
    console.log(`      - Facebook    : ${status.fb ? "✔ PUBLISHED" : "⏳ PENDING"}`);
    console.log(`      - Instagram   : ${status.ig ? "✔ PUBLISHED" : "⏳ PENDING"}`);

    const allPublished = status.yt && status.fb && status.ig;
    if (allPublished) {
      console.log(`   🎉 SEMUA PLATFORM SUDAH LIVE UNTUK SLOT INI!`);
    } else {
      console.log(`\n   👉 Perintah 1-Klik untuk Rilis:`);
      console.log(`      npx tsx scripts/publish-all.ts --book ${slot.bookSlug} --lang ${slot.lang}`);
    }
  });

  console.log("\n------------------------------------------------------------------");
  console.log("💡 TIPS GOLDEN HOUR (KIDS CONTENT):");
  console.log("   Jam 19:00 - 20:00 WIB adalah waktu emas anak bersiap tidur.");
  console.log("   Pastikan video sudah siap dan live sebelum jam 19:00 WIB!");
  console.log("------------------------------------------------------------------\n");
}

function showCalendar() {
  printHeader();
  console.log("🗓️ KALENDER PRODUKSI & JADWAL RILIS HARIAN BULAN 1 (7 NOV – 6 DES 2026):");
  console.log("==================================================================");

  let currentWeek = "";
  DAILY_CALENDAR_MONTH_1.forEach((slot, i) => {
    const status = checkPublicationStatus(slot.bookSlug, slot.lang);
    const pubMark = status.yt && status.fb && status.ig ? "✔ [SEMUA LIVE]" : "⏳ [PENDING]";
    console.log(
      `   • [${slot.date} (${slot.dayName}) | ${slot.timeSlot}] ${slot.bookSlug} [${slot.lang.toUpperCase()}] — ${slot.slotType} ${pubMark}`
    );
    console.log(`     "${slot.theme}"`);
  });

  console.log("\n==================================================================");
  console.log("Keterangan:");
  console.log("• Pagi (08:30 WIB): Shorts/Reels keceriaan & humor akhir pekan.");
  console.log("• Malam (19:00/19:30 WIB): Dongeng sebelum tidur (Bedtime story 16:9 & Reels).");
  console.log("• Marathon Mingguan (19:30 WIB): Kompilasi long-form ~15-60 menit penahan retensi.");
  console.log("==================================================================\n");
}

function triggerReminder() {
  const todaySlots = getTodaySlot();
  if (todaySlots.length === 0) return;

  const slot = todaySlots[0];
  const title = `Zayn Storybook: Tayang Hari Ini!`;
  const message = `Pukul ${slot.timeSlot}: ${slot.bookSlug} (${slot.lang.toUpperCase()}) - ${slot.slotType}`;

  const sent = sendMacNotification(title, message, "Glass");
  if (sent) {
    console.log(`✔ Notifikasi macOS berhasil dikirimkan: "${message}"`);
  }
}

function setupCrontab() {
  console.log("\n⚙️ SETUP AUTO-REMINDER CRON (Mac OS)");
  console.log("==================================================================");
  const repoDir = process.cwd();
  const cronCommand = `0 18 * * * cd ${repoDir} && /usr/local/bin/node -r tsx/register scripts/content-calendar.ts --remind >> /tmp/zayn-storybook-cron.log 2>&1`;

  console.log("Perintah reminder otomatis disiapkan untuk berjalan setiap hari jam 18:00 WIB");
  console.log("(1 jam sebelum jam tayang utama 19:00 WIB).");
  console.log("\nBaris Crontab:");
  console.log(`  ${cronCommand}\n`);
  console.log("Untuk mengaktifkan ke sistem Mac Anda, jalankan:");
  console.log("  (crontab -l 2>/dev/null; echo \"0 18 * * * cd " + repoDir + " && npx tsx scripts/content-calendar.ts --remind\") | crontab -");
  console.log("==================================================================\n");
}

async function runChildCommand(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n▶️ Executing: ${bin} ${args.join(" ")}`);
    const proc = spawn(bin, args, { stdio: "inherit" });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with code ${code}: ${bin} ${args.join(" ")}`));
    });
  });
}

async function publishToday(
  dryRun: boolean,
  targetBook?: string,
  targetLang?: "id" | "en",
  slotFilter?: "morning" | "evening" | "auto" | "all"
) {
  printHeader();
  let slots = getTodaySlot();
  if (targetBook) {
    slots = [
      {
        dayName: "Senin",
        timeSlot: "Now",
        slotType: "Prime Bedtime Story",
        bookSlug: targetBook,
        lang: targetLang || "id",
        format: "both",
        targetPlatforms: ["All"],
        theme: "Manual Broadcast Dispatch",
      },
    ];
  }

  if (slots.length === 0) {
    console.log("🌴 Hari ini tidak ada jadwal rilis wajib.");
    return;
  }

  if (!targetBook && slotFilter && slotFilter !== "all") {
    const jakartaHour = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta",
        hour: "numeric",
        hour12: false,
      }).format(new Date()),
      10
    );
    const isMorning = slotFilter === "morning" || (slotFilter === "auto" && jakartaHour < 14);

    const filtered = slots.filter((s) => {
      const isMorningSlot =
        s.timeSlot.includes("07:") ||
        s.timeSlot.includes("08:") ||
        s.timeSlot.toLowerCase().includes("pagi") ||
        s.slotType.toLowerCase().includes("morning");
      return isMorning ? isMorningSlot : !isMorningSlot;
    });

    if (filtered.length > 0) {
      slots = filtered;
      console.log(`🎯 Filter Slot Aktif: [${isMorning ? "PAGI / MORNING" : "MALAM / BEDTIME"}] (${slots.length} tayangan)`);
    } else {
      console.log(`ℹ️ Tidak ada slot khusus ${isMorning ? "pagi" : "malam"}. Memproses slot jadwal hari ini...`);
    }
  }

  for (const slot of slots) {
    console.log(`\n🚀 Memproses Jadwal: ${slot.bookSlug} [${slot.lang.toUpperCase()}] (${slot.timeSlot})`);

    try {
      // Ensure story assets exist locally, pull from Cloudflare R2 if missing
      const storyDir = path.resolve("./stories", slot.bookSlug);
      const storyPath = path.join(storyDir, "story.json");
      if (!existsSync(storyPath)) {
        console.log(`📥 Story assets not found locally for [${slot.bookSlug}]. Pulling from Cloudflare R2...`);
        await runChildCommand("npx", ["tsx", "scripts/manage-story-storage.ts", "pull", slot.bookSlug]);
      }

      const status = checkPublicationStatus(slot.bookSlug, slot.lang);

      if (status.yt && status.fb && status.ig && !dryRun) {
        console.log(`✔ [ALREADY LIVE] Buku ${slot.bookSlug} (${slot.lang}) sudah terbit di semua platform. Lewati.`);
        continue;
      }

      // Step 1: Cek apakah file video sudah ada; jika belum, render otomatis!
      const storyJson = JSON.parse(await fs.readFile(path.join(storyDir, "story.json"), "utf-8"));
      const vertPath = storyJson.exports?.[slot.lang]?.vertical?.path ? path.join(storyDir, storyJson.exports[slot.lang].vertical.path) : null;
      const landPath = storyJson.exports?.[slot.lang]?.landscape?.path ? path.join(storyDir, storyJson.exports[slot.lang].landscape.path) : null;

      const needRender = !vertPath || !existsSync(vertPath) || !landPath || !existsSync(landPath);

      if (needRender) {
        console.log(`⚙️ Video belum ada di disk. Menjalankan render Remotion otomatis...`);
        const renderArgs = ["scripts/render-book.ts", "--book", slot.bookSlug, "--lang", slot.lang, "--format", slot.format];
        await runChildCommand("npx", ["tsx", ...renderArgs]);
      }

      // Step 2: Jalankan sync & upload ke semua platform
      console.log(`📡 Mempublikasikan ke platform tujuan...`);
      const publishArgs = ["scripts/publish-all.ts", "--book", slot.bookSlug, "--lang", slot.lang];
      if (dryRun) publishArgs.push("--dry-run");

      await runChildCommand("npx", ["tsx", ...publishArgs]);

      // Step 3: Sinkronkan kembali manifest story.json yang baru ke Cloudflare R2
      if (!dryRun) {
        console.log(`☁️ Syncing updated story manifest back to Cloudflare R2...`);
        await runChildCommand("npx", ["tsx", "scripts/manage-story-storage.ts", "push", slot.bookSlug, "--manifest-only"]);
      }
    } catch (slotErr: any) {
      console.error(`\n❌ Gagal memproses jadwal siaran untuk [${slot.bookSlug}] [${slot.lang}]:`, slotErr.message);
      try {
        console.log(`✈️ Mengirimkan notifikasi kegagalan siaran ke Telegram...`);
        await notifyTelegramFailure({
          bookSlug: slot.bookSlug,
          lang: slot.lang,
          slot: `${slot.dayName}, ${slot.timeSlot} (${slot.slotType})`,
          platform: "Daily Broadcast Pipeline",
          error: slotErr,
          dryRun,
        });
      } catch (tgErr: any) {
        console.warn("⚠️ Telegram failure alert dispatch warning:", tgErr.message);
      }
      throw slotErr;
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--calendar") || args.includes("--all") || args.includes("-a")) {
    showCalendar();
  } else if (args.includes("--remind")) {
    triggerReminder();
  } else if (args.includes("--cron")) {
    setupCrontab();
  } else if (args.includes("--announce-today") || args.includes("--announce") || args.includes("--teaser")) {
    const dryRun = args.includes("--dry-run");
    const force = args.includes("--force");
    const bookIdx = args.indexOf("--book");
    const book = bookIdx !== -1 && args[bookIdx + 1] !== "auto" ? args[bookIdx + 1] : undefined;
    const langIdx = args.indexOf("--lang");
    const lang =
      langIdx !== -1 && (args[langIdx + 1] === "id" || args[langIdx + 1] === "en")
        ? (args[langIdx + 1] as "id" | "en")
        : undefined;
    const slotIdx = args.indexOf("--slot");
    const slot = slotIdx !== -1 ? (args[slotIdx + 1] as "morning" | "evening" | "auto" | "all") : "auto";

    const { publishAnnouncement } = await import("./publish-announcement");
    await publishAnnouncement({
      bookSlug: book,
      lang,
      slot: slot === "all" ? "auto" : slot,
      dryRun,
      force,
    });
  } else if (args.includes("--publish-today") || args.includes("--run-today")) {
    const dryRun = args.includes("--dry-run");
    const bookIdx = args.indexOf("--book");
    const book = bookIdx !== -1 && args[bookIdx + 1] !== "auto" ? args[bookIdx + 1] : undefined;
    const langIdx = args.indexOf("--lang");
    const lang = langIdx !== -1 && (args[langIdx + 1] === "id" || args[langIdx + 1] === "en") ? args[langIdx + 1] as "id" | "en" : undefined;
    const slotIdx = args.indexOf("--slot");
    const slot = slotIdx !== -1 ? (args[slotIdx + 1] as "morning" | "evening" | "auto" | "all") : "auto";
    await publishToday(dryRun, book, lang, slot);
  } else {
    await showToday();
  }
}

main().catch(async (err) => {
  console.error("❌ Fatal error in Content Calendar Scheduler:", err);
  try {
    await notifyTelegramFailure({
      platform: "Content Calendar Scheduler (Fatal)",
      error: err,
    });
  } catch {}
  process.exit(1);
});
