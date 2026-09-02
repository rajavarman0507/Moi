"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

export interface MoodRecord {
  id: string;
  userId: string;
  date: string;
  moodId: string;
  emoji: string;
  label: string;
  score: number;
}

interface MoodChartProps {
  moodEntries: MoodRecord[];
  myUid: string;
  partnerUid?: string;
  myName: string;
  partnerName: string;
}

const moodMap: Record<number, string> = {
  7: "💖 Loved",
  6: "🔥 Passionate",
  5: "😊 Happy",
  4: "☕ Cozy",
  3: "😴 Tired",
  2: "🥺 Needy",
  1: "🌧️ Low",
};

export default function MoodChart({
  moodEntries,
  myUid,
  partnerUid,
  myName,
  partnerName,
}: MoodChartProps) {
  // Generate date array for last 30 days UTC
  const today = new Date();
  const dateList: string[] = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    dateList.push(dateStr);
  }

  // Map entries into chart data
  const chartData = dateList.map((dateStr) => {
    const myEntry = moodEntries.find((e) => e.date === dateStr && e.userId === myUid);
    const partnerEntry = partnerUid
      ? moodEntries.find((e) => e.date === dateStr && e.userId === partnerUid)
      : null;

    const shortDate = dateStr.slice(5); // "MM-DD"

    return {
      date: dateStr,
      displayDate: shortDate,
      myScore: myEntry ? myEntry.score : null,
      myEmoji: myEntry ? myEntry.emoji : "",
      partnerScore: partnerEntry ? partnerEntry.score : null,
      partnerEmoji: partnerEntry ? partnerEntry.emoji : "",
    };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="p-3 bg-[#1B0710]/95 backdrop-blur-md border border-rose-500/30 rounded-2xl shadow-xl text-xs space-y-1">
          <p className="font-bold text-rose-300 border-b border-rose-900/40 pb-1">{label}</p>
          <p className="text-white">
            <span className="font-semibold text-rose-400">{myName}:</span>{" "}
            {data.myScore ? `${data.myEmoji} ${moodMap[data.myScore] || ""}` : "No entry"}
          </p>
          {partnerUid && (
            <p className="text-white">
              <span className="font-semibold text-amber-300">{partnerName}:</span>{" "}
              {data.partnerScore ? `${data.partnerEmoji} ${moodMap[data.partnerScore] || ""}` : "No entry"}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-[320px] pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#4A152B" opacity={0.4} />
          <XAxis dataKey="displayDate" stroke="#FDA4AF" fontSize={10} tickLine={false} />
          <YAxis
            domain={[1, 7]}
            ticks={[1, 2, 3, 4, 5, 6, 7]}
            stroke="#FDA4AF"
            fontSize={10}
            tickFormatter={(val) => moodMap[val]?.split(" ")[0] || ""}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            height={36}
            formatter={(value) => <span className="text-xs font-semibold text-rose-200">{value}</span>}
          />
          <Line
            type="monotone"
            dataKey="myScore"
            name={myName}
            stroke="#FB7185"
            strokeWidth={3}
            dot={{ r: 4, fill: "#FB7185" }}
            activeDot={{ r: 7, fill: "#FFF" }}
            connectNulls
          />
          {partnerUid && (
            <Line
              type="monotone"
              dataKey="partnerScore"
              name={partnerName}
              stroke="#FDE047"
              strokeWidth={3}
              dot={{ r: 4, fill: "#FDE047" }}
              activeDot={{ r: 7, fill: "#FFF" }}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
