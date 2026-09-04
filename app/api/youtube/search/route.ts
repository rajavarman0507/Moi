import { NextRequest, NextResponse } from "next/server";

interface TrackItem {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
}

const FALLBACK_TRACKS: TrackItem[] = [
  {
    videoId: "450p7goxZqg",
    title: "All of Me - John Legend",
    thumbnail: "https://i.ytimg.com/vi/450p7goxZqg/hqdefault.jpg",
    channelTitle: "John Legend",
  },
  {
    videoId: "2Vv-BfVoq4g",
    title: "Perfect - Ed Sheeran",
    thumbnail: "https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg",
    channelTitle: "Ed Sheeran",
  },
  {
    videoId: "09R8_2nJtjg",
    title: "Sugar - Maroon 5",
    thumbnail: "https://i.ytimg.com/vi/09R8_2nJtjg/hqdefault.jpg",
    channelTitle: "Maroon 5",
  },
  {
    videoId: "lp-EO5I60KA",
    title: "Thinking Out Loud - Ed Sheeran",
    thumbnail: "https://i.ytimg.com/vi/lp-EO5I60KA/hqdefault.jpg",
    channelTitle: "Ed Sheeran",
  },
  {
    videoId: "rtOvBOTyX00",
    title: "A Thousand Years - Christina Perri",
    thumbnail: "https://i.ytimg.com/vi/rtOvBOTyX00/hqdefault.jpg",
    channelTitle: "Christina Perri",
  },
  {
    videoId: "hLQl3WQQoQ0",
    title: "Someone Like You - Adele",
    thumbnail: "https://i.ytimg.com/vi/hLQl3WQQoQ0/hqdefault.jpg",
    channelTitle: "Adele",
  },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") || "";

  // 1. Basic Authorization Check: Reject unauthenticated public scraping requests
  const authHeader = req.headers.get("authorization");
  if (!authHeader && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!query) {
    return NextResponse.json({ tracks: [], source: "live" });
  }

  // 2. If no API key configured in env, return fallback suggestions
  if (!apiKey) {
    const filtered = FALLBACK_TRACKS.filter(
      (t) =>
        t.title.toLowerCase().includes(query.toLowerCase()) ||
        t.channelTitle.toLowerCase().includes(query.toLowerCase())
    );
    return NextResponse.json({
      tracks: filtered.length > 0 ? filtered : FALLBACK_TRACKS,
      source: "fallback",
      warning: "No YouTube API Key set in environment; showing featured suggestions.",
    });
  }

  // 3. Query YouTube Data API v3
  try {
    const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(
      query
    )}&key=${apiKey}`;

    const res = await fetch(ytUrl);
    if (!res.ok) {
      console.warn(`YouTube Data API returned status ${res.status}`);
      // Handle rate limits (429) or API errors by falling back gracefully
      const filtered = FALLBACK_TRACKS.filter((t) =>
        t.title.toLowerCase().includes(query.toLowerCase())
      );
      return NextResponse.json({
        tracks: filtered.length > 0 ? filtered : FALLBACK_TRACKS,
        source: "fallback",
        warning: `YouTube Search temporarily unavailable (API status ${res.status}). Showing curated suggestions.`,
      });
    }

    const data = await res.json();
    const tracks: TrackItem[] = (data.items || []).map((item: any) => ({
      videoId: item.id?.videoId || "",
      title: item.snippet?.title || "Unknown Title",
      thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
      channelTitle: item.snippet?.channelTitle || "YouTube Channel",
    }));

    return NextResponse.json({ tracks, source: "live" });
  } catch (err: any) {
    console.error("Error fetching YouTube search results:", err);
    return NextResponse.json({
      tracks: FALLBACK_TRACKS,
      source: "fallback",
      warning: "Network error contacting YouTube. Showing curated suggestions.",
    });
  }
}
