export const WELCOME_PHONE_MAX = 10;

export type AvatarTone = '' | 'orange' | 'green';

export interface WelcomeMockPollOption {
  label: string;
  fillPercent: number;
}

export interface WelcomeMockPost {
  id: string;
  displayName: string;
  username: string;
  timeLabel: string;
  initial: string;
  avatarTone: AvatarTone;
  content: string;
  likesCount: number;
  commentsCount: number;
  poll?: WelcomeMockPollOption[];
  mediaHint?: string;
  linkHint?: string;
}

export type WelcomeMockPostView = WelcomeMockPost & {
  hasLiked: boolean;
};
