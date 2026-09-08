export interface SshTunnelConfig {
  enabled: boolean;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshAuthType: "password" | "key";
  sshPassword?: string;
  sshPrivateKey?: string;
  sshPassphrase?: string;
}

export interface DbCredentials {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
  sshTunnel?: SshTunnelConfig;
}

export type RejectionReason =
  | 'followers'
  | 'avg views'
  | 'bad engagement rate'
  | 'woman'
  | 'bad content'
  | 'unrelated'
  | 'other';

export interface YtChannel {
  channel_id: string;
  channel_handle: string | null;
  channel_name: string;
  description: string | null;
  profile_photo_url: string | null;
  banner_photo_url: string | null;
  subscriber_count: number | null;
  avg_views: number | null;
  avg_engagement_rate: number | null;
  videos_last_month: number | null;
  valid: boolean | null; // null = unreviewed, true = approved, false = rejected
  rejection_reason: RejectionReason | null;
  last_fetched_at: string | null;
  created_at: string;
  updated_at: string;
  // Computed / Joined fields
  discovery_video_id?: string | null;
  discovery_video_title?: string | null;
  discovery_thumbnail_url?: string | null;
  matched_keywords?: string[];
}

export interface Keyword {
  id: number;
  text: string;
  used_in_current_cycle: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  // Computed fields
  total_matched?: number;
  passed_gate?: number;
  rejected_gate?: number;
}

export interface YtVideo {
  video_id: string;
  channel_id: string;
  found_via_keyword_id: number | null;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

export interface InfluencerEmail {
  id: number;
  channel_id: string;
  channel_name?: string;
  channel_handle?: string;
  profile_photo_url?: string;
  video_id: string | null;
  video_title?: string | null;
  email_address: string;
  transcript: string | null;
  outreach_commentary: string | null;
  outreach_draft: string | null;
  outreach_generated_at: string | null;
  outreach_email: string | null;
  outreach_sent_at: string | null;
  followup_commentary: string | null;
  followup_draft: string | null;
  followup_generated_at: string | null;
  followup_email: string | null;
  followup_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  totalChannels: number;
  unreviewedChannels: number;
  approvedChannels: number;
  rejectedChannels: number;
  totalKeywords: number;
  activeKeywords: number;
  emailsGenerated: number;
  emailsSent: number;
  avgEngagementRate: number;
  avgViews: number;
}
