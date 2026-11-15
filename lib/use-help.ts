"use client";
// Live Help SC feed for one section: posts + their latest reply, kept fresh by Realtime.
import { useEffect, useMemo, useState } from "react";
import { distanceM, getPosition, isHelpDemo, listPosts, listRecentReplies, SECTIONS, subscribeHelp, type SectionId } from "./help";
import type { HelpPost, HelpReply } from "./help-types";

export type FeedRow = { post: HelpPost; latest: HelpReply | null; distance: number | null };

export function useHelpFeed(section: SectionId) {
  const [posts, setPosts] = useState<HelpPost[] | null>(null);
  const [replies, setReplies] = useState<HelpReply[]>([]);
  const [error, setError] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    listPosts()
      .then((p) => {
        setPosts(p);
        return listRecentReplies().then(setReplies);
      })
      .catch(() => {
        setPosts((p) => p ?? []);
        setError(true);
      });
    getPosition().then(setMe);
    return subscribeHelp({
      post: (p) => {
        setPosts((l) => [p, ...(l ?? []).filter((x) => x.id !== p.id)]);
        setFresh(p.id);
      },
      reply: (r) => {
        setReplies((l) => (l.some((x) => x.id === r.id) ? l : [r, ...l]));
        setFresh(r.post_id);
      },
    });
  }, []);

  const rows = useMemo(() => {
    const kinds = SECTIONS[section].kinds;
    const latest = new Map<string, HelpReply>();
    for (const r of replies) {
      const cur = latest.get(r.post_id);
      if (!cur || +new Date(r.created_at) > +new Date(cur.created_at)) latest.set(r.post_id, r);
    }
    const now = Date.now();
    const activity = (r: FeedRow) => Math.max(+new Date(r.post.created_at), r.latest ? +new Date(r.latest.created_at) : 0);
    return (posts ?? [])
      .filter((p) => kinds.includes(p.kind) && p.status !== "closed" && +new Date(p.expires_at) > now)
      .map((post) => ({ post, latest: latest.get(post.id) ?? null, distance: me ? distanceM(me, post) : null }))
      .sort((a, b) => (a.post.status === "open") !== (b.post.status === "open") ? (a.post.status === "open" ? -1 : 1) : activity(b) - activity(a));
  }, [posts, replies, me, section]);

  return { loading: posts === null, error, demo: posts !== null && isHelpDemo(), rows, fresh, addLocal: (p: HelpPost) => setPosts((l) => [p, ...(l ?? []).filter((x) => x.id !== p.id)]) };
}
