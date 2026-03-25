# ShadowDL

A sleek, production-grade video downloader. Supports YouTube, Facebook, Instagram, TikTok, Reddit, and X (Twitter). All-black UI, no watermarks, native browser downloads, optional Google Drive save.

## Prerequisites

- Node.js 20+
- Python 3.11+
- yt-dlp (`pip install yt-dlp`)
- ffmpeg (`brew install ffmpeg` on macOS)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Oscar-G13/shadowdl.git
cd shadowdl
npm install
cd backend && pip install -r requirements.txt && cd ..
```

### 2. Environment

```bash
cp .env.example .env
```

Fill in your Google OAuth credentials in `.env`.

### 3. Run

Open two terminals:

**Terminal 1 — Backend:**
```bash
cd backend
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Google Drive

1. Click "Connect Google Drive" in the top bar.
2. Authorize via Google OAuth.
3. Toggle "Save to Google Drive" before downloading.

## Environment Variables

See `.env.example` for all required variables.

---

Built by Oscar G.
