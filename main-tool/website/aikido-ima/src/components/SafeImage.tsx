"use client";

import React, { useState, useEffect } from "react";
import { Video } from "lucide-react";
import { getProxiedImageUrl } from "@/lib/utils";

interface CreatorAvatarProps {
  src?: string | null;
  name?: string;
  className?: string;
  initialsClassName?: string;
}

export function CreatorAvatar({
  src,
  name = "Creator",
  className = "w-8 h-8 rounded-full object-cover bg-slate-800 ring-1 ring-slate-700 shrink-0",
  initialsClassName = "w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0 ring-1 ring-slate-700",
}: CreatorAvatarProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const initial = (name || "C").trim().charAt(0).toUpperCase() || "C";

  if (!src || hasError) {
    return (
      <div className={initialsClassName} title={name}>
        {initial}
      </div>
    );
  }

  return (
    <img
      src={getProxiedImageUrl(src, "avatar")}
      alt={name}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}

interface VideoThumbnailProps {
  src?: string | null;
  title?: string;
  className?: string;
  fallbackClassName?: string;
}

export function VideoThumbnail({
  src,
  title = "Video thumbnail",
  className = "w-12 h-7 object-cover rounded bg-slate-800 ring-1 ring-slate-700 shrink-0",
  fallbackClassName = "w-12 h-7 bg-slate-800 rounded flex items-center justify-center text-slate-500 shrink-0 ring-1 ring-slate-700/50",
}: VideoThumbnailProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    return (
      <div className={fallbackClassName} title={title}>
        <Video className="w-3.5 h-3.5" />
      </div>
    );
  }

  return (
    <img
      src={getProxiedImageUrl(src, "thumbnail")}
      alt={title}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
