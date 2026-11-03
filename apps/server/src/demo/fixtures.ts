import type {
  ContentType,
  Format,
  MetricKey,
  MetricScope,
  Platform,
  PostStatus,
} from '@creator-center/shared';
import { addDays, isoNow } from '@creator-center/shared';
import type { MetricInput } from '../repositories/accounts.js';
import type { PostInput } from '../repositories/posts.js';

export interface DemoPostSpec {
  remoteId: string;
  title: string;
  format: string;
  status: PostStatus;
  dayOffset: number;
  hour?: number;
  metrics: Partial<Record<MetricKey, number | null>>;
}

export interface DemoAccountSpec {
  id: string;
  platform: Platform;
  displayName: string;
  handle: string;
  followers: number;
  followerDelta: number;
  following: number | null;
  posts: number;
  metrics: Partial<Record<MetricKey, { value: number | null; scope: MetricScope; period: string; reason?: string }>>;
  postSpecs: DemoPostSpec[];
}

function metric(
  key: MetricKey,
  value: number | null,
  scope: MetricScope,
  period: string,
  source: string,
  measuredAt: string,
  reason: string | null = null,
): MetricInput {
  return {
    key,
    scope,
    availability: value === null ? (reason ? 'unsupported' : 'pending') : 'value',
    value,
    period,
    source,
    reason,
    measuredAt,
  };
}

const SOURCE = 'Creator console';

export function demoAccounts(): DemoAccountSpec[] {
  return [
    {
      id: 'demo-douyin-main',
      platform: 'douyin',
      displayName: 'Liam Physics',
      handle: '@liamphysics',
      followers: 128_420,
      followerDelta: 3_600,
      following: 214,
      posts: 486,
      metrics: {
        followers: { value: 128_420, scope: 'current', period: 'current' },
        following: { value: 214, scope: 'current', period: 'current' },
        posts: { value: 486, scope: 'lifetime', period: 'lifetime' },
        views: { value: 2_340_000, scope: 'lifetime', period: 'lifetime' },
        likes: { value: 1_120_000, scope: 'lifetime', period: 'lifetime' },
        comments: { value: 34_200, scope: 'lifetime', period: 'lifetime' },
        shares: { value: 18_600, scope: 'lifetime', period: 'lifetime' },
        saves: { value: 92_400, scope: 'lifetime', period: 'lifetime' },
        completion_rate: { value: 41.2, scope: 'window', period: 'last 7 days' },
        watch_hours: { value: null, scope: 'window', period: '—', reason: 'The creator console does not report watch hours.' },
      },
      postSpecs: [
        post('dy-main-bpho', 'BPhO 2024 Round 1 — full walkthrough', 'video', 'published', -5, { views: 48_200, likes: 4_820, comments: 312, shares: 186, saves: 2_140 }),
        post('dy-main-moment', 'Moment of inertia in 60 seconds', 'video', 'published', -2, { views: 126_400, likes: 12_840, comments: 684, shares: 1_240, saves: 5_860 }),
        post('dy-main-heavier', 'Why a heavier ball does not fall faster', 'video', 'published', -9, { views: 96_800, likes: 8_420, comments: 512, shares: 968, saves: 3_120 }),
        post('dy-main-paper2', 'Paper 2 question 3 in 40 seconds', 'video', 'published', -12, { views: 64_200, likes: 5_280, comments: 286, shares: 540, saves: 1_860 }),
        post('dy-main-cosine', 'The cosine rule, quickly', 'video', 'published', -18, { views: 42_100, likes: 3_640, comments: 174, shares: 312, saves: 1_240 }),
        post('dy-main-capacitors', 'Capacitors: 3 marks in 30 seconds', 'video', 'scheduled', 3, {}, 18),
      ],
    },
    {
      id: 'demo-douyin-shorts',
      platform: 'douyin',
      displayName: 'Liam Physics Shorts',
      handle: '@liamshorts',
      followers: 18_760,
      followerDelta: 940,
      following: 88,
      posts: 92,
      metrics: {
        followers: { value: 18_760, scope: 'current', period: 'current' },
        following: { value: 88, scope: 'current', period: 'current' },
        posts: { value: 92, scope: 'lifetime', period: 'lifetime' },
        views: { value: 412_000, scope: 'lifetime', period: 'lifetime' },
        likes: { value: 96_000, scope: 'lifetime', period: 'lifetime' },
        comments: { value: 5_100, scope: 'lifetime', period: 'lifetime' },
        shares: { value: 2_400, scope: 'lifetime', period: 'lifetime' },
        saves: { value: 11_800, scope: 'lifetime', period: 'lifetime' },
        completion_rate: { value: 38.4, scope: 'window', period: 'last 7 days' },
        watch_hours: { value: null, scope: 'window', period: '—', reason: 'The creator console does not report watch hours.' },
      },
      postSpecs: [
        post('dy-shorts-heavier', 'Why a heavier ball does not fall faster', 'video', 'published', -9, { views: 38_600, likes: 3_240, comments: 168, shares: 312, saves: 980 }),
        post('dy-shorts-fbd', 'Draw a free-body diagram in 20 seconds', 'video', 'published', -7, { views: 28_400, likes: 2_480, comments: 96, shares: 198, saves: 740 }),
        post('dy-shorts-radian', 'What is a radian?', 'video', 'published', -15, { views: 21_600, likes: 1_840, comments: 74, shares: 126, saves: 512 }),
        post('dy-shorts-momentum', 'Momentum in one minute', 'video', 'scheduled', 5, {}, 18),
      ],
    },
    {
      id: 'demo-xiaohongshu-main',
      platform: 'xiaohongshu',
      displayName: 'Liam Physics Notes',
      handle: 'liamphysicsnotes',
      followers: 76_300,
      followerDelta: 2_100,
      following: 46,
      posts: 318,
      metrics: {
        followers: { value: 76_300, scope: 'current', period: 'current' },
        following: { value: 46, scope: 'current', period: 'current' },
        posts: { value: 318, scope: 'lifetime', period: 'lifetime' },
        views: { value: 186_400, scope: 'window', period: 'last 7 days' },
        likes: { value: 42_100, scope: 'window', period: 'last 7 days' },
        comments: { value: 3_900, scope: 'window', period: 'last 7 days' },
        shares: { value: 2_800, scope: 'window', period: 'last 7 days' },
        saves: { value: 28_500, scope: 'window', period: 'last 7 days' },
        watch_hours: { value: null, scope: 'window', period: '—', reason: 'Xiaohongshu does not report watch hours.' },
        avg_view_seconds: { value: null, scope: 'window', period: '—', reason: 'The creator console does not report average view time.' },
        completion_rate: { value: null, scope: 'window', period: '—', reason: 'Completion rate needs video views the console does not expose.' },
      },
      postSpecs: [
        post('xhs-moment', 'Moment of inertia in 60 seconds', 'video', 'published', -2, { views: 32_400, likes: 4_820, comments: 186, shares: 420, saves: 2_860 }),
        post('xhs-heavier', 'Why a heavier ball does not fall faster', 'video', 'published', -9, { views: 26_800, likes: 3_640, comments: 142, shares: 312, saves: 2_120 }),
        post('xhs-electric', 'Electric fields: 6 mark checklist', 'text', 'published', -4, { views: 18_600, likes: 2_840, comments: 96, shares: 186, saves: 3_420 }),
        post('xhs-annotate', 'How I annotate a past paper', 'text', 'published', -11, { views: 14_200, likes: 2_120, comments: 64, shares: 112, saves: 2_680 }),
        post('xhs-calendar', '2026 competition calendar', 'text', 'scheduled', 12, {}, 9),
      ],
    },
    {
      id: 'demo-wechat-main',
      platform: 'wechat',
      displayName: "Liam's Physics Club",
      handle: 'liamsphysicsclub',
      followers: 24_890,
      followerDelta: 480,
      following: null,
      posts: 142,
      metrics: {
        followers: { value: 24_890, scope: 'current', period: 'current' },
        following: { value: null, scope: 'current', period: '—', reason: '公众号 does not expose following.' },
        posts: { value: 142, scope: 'lifetime', period: 'lifetime' },
        views: { value: 12_480, scope: 'window', period: 'yesterday' },
        likes: { value: null, scope: 'window', period: '—', reason: '公众号 does not report likes in the creator console.' },
        comments: { value: null, scope: 'window', period: '—', reason: '公众号 does not report comments in the creator console.' },
        shares: { value: 486, scope: 'window', period: 'yesterday' },
        saves: { value: null, scope: 'window', period: '—', reason: '公众号 does not report saves.' },
        watch_hours: { value: null, scope: 'window', period: '—', reason: '公众号 does not report watch time.' },
        avg_view_seconds: { value: null, scope: 'window', period: '—', reason: '公众号 does not report average view time.' },
        completion_rate: { value: null, scope: 'window', period: '—', reason: '公众号 does not report completion.' },
      },
      postSpecs: [
        post('wx-revision', 'Half-term revision plan', 'article', 'published', -8, { views: 8_240, likes: 286, comments: 42, shares: 96, saves: 214 }),
        post('wx-tutoring', 'November tutoring notes', 'article', 'published', -16, { views: 6_120, likes: 198, comments: 28, shares: 64, saves: 148 }),
        post('wx-mocks', 'Mock exam checklist', 'article', 'scheduled', 4, {}, 8),
      ],
    },
    {
      id: 'demo-bilibili-main',
      platform: 'bilibili',
      displayName: 'Liam Physics',
      handle: 'liamphysics',
      followers: 54_120,
      followerDelta: 1_650,
      following: null,
      posts: 264,
      metrics: {
        followers: { value: 54_120, scope: 'current', period: 'current' },
        following: { value: null, scope: 'current', period: '—', reason: 'Bilibili does not expose following in the creator console.' },
        posts: { value: 264, scope: 'lifetime', period: 'lifetime' },
        views: { value: 3_890_000, scope: 'lifetime', period: 'lifetime' },
        likes: { value: 320_000, scope: 'lifetime', period: 'lifetime' },
        comments: { value: 21_400, scope: 'lifetime', period: 'lifetime' },
        shares: { value: 15_800, scope: 'lifetime', period: 'lifetime' },
        saves: { value: 78_000, scope: 'lifetime', period: 'lifetime' },
        watch_hours: { value: null, scope: 'window', period: '—', reason: 'The aggregate watch-time response is null for this account.' },
        completion_rate: { value: 44.6, scope: 'window', period: 'last 28 days' },
      },
      postSpecs: [
        post('bv-bpho-2024', 'BPhO 2024 Round 1 — full walkthrough', 'video', 'published', -5, { views: 184_200, likes: 16_840, comments: 1_240, shares: 968, saves: 8_420 }),
        post('bv-heavier', 'Why a heavier ball does not fall faster', 'video', 'published', -9, { views: 96_800, likes: 8_420, comments: 512, shares: 968, saves: 3_120 }),
        post('bv-circular', 'Circular motion: the mistake everyone makes', 'video', 'published', -13, { views: 74_600, likes: 6_240, comments: 386, shares: 642, saves: 2_980 }),
        post('bv-ap-frq', 'AP Physics 1 FRQ walkthrough', 'video', 'published', -21, { views: 58_400, likes: 4_860, comments: 264, shares: 512, saves: 2_240 }),
        post('bv-radians', 'Why we count in radians', 'video', 'scheduled', 9, {}, 17),
      ],
    },
    {
      id: 'demo-youtube-main',
      platform: 'youtube',
      displayName: 'Liam Physics',
      handle: 'liamphysics',
      followers: 41_300,
      followerDelta: 1_200,
      following: null,
      posts: 128,
      metrics: {
        followers: { value: 41_300, scope: 'current', period: 'current' },
        following: { value: null, scope: 'current', period: '—', reason: 'YouTube does not expose following.' },
        posts: { value: 128, scope: 'lifetime', period: 'lifetime' },
        views: { value: 1_760_000, scope: 'lifetime', period: 'lifetime' },
        likes: { value: 84_200, scope: 'lifetime', period: 'lifetime' },
        comments: { value: 6_700, scope: 'lifetime', period: 'lifetime' },
        shares: { value: null, scope: 'window', period: '—', reason: 'The Analytics API does not return shares for this channel.' },
        saves: { value: null, scope: 'window', period: '—', reason: 'YouTube does not report saves.' },
        watch_hours: { value: 4_820, scope: 'window', period: 'last 28 days' },
        avg_view_seconds: { value: 312, scope: 'window', period: 'last 28 days' },
        completion_rate: { value: 46.8, scope: 'window', period: 'last 28 days' },
      },
      postSpecs: [
        post('yt-bpho-2024', 'BPhO 2024 Round 1 — full walkthrough', 'video', 'published', -5, { views: 68_400, likes: 5_240, comments: 312, shares: 186, saves: 2_140 }),
        post('yt-ap-frq', 'AP Physics 1 FRQ walkthrough', 'video', 'published', -21, { views: 42_800, likes: 3_480, comments: 198, shares: 142, saves: 1_620 }),
        post('yt-radians', 'Why we count in radians', 'video', 'scheduled', 9, {}, 17),
      ],
    },
  ];
}

function post(
  remoteId: string,
  title: string,
  format: string,
  status: PostStatus,
  dayOffset: number,
  metrics: Partial<Record<MetricKey, number | null>>,
  hour = 10,
): DemoPostSpec {
  return { remoteId, title, format, status, dayOffset, hour, metrics };
}

export function demoMetricInputs(
  spec: DemoAccountSpec,
  now: string,
): MetricInput[] {
  return Object.entries(spec.metrics).map(([key, entry]) =>
    metric(
      key as MetricKey,
      entry.value,
      entry.scope,
      entry.period,
      key === 'watch_hours' || key === 'avg_view_seconds' || key === 'completion_rate'
        ? spec.platform === 'youtube'
          ? 'YouTube Analytics'
          : SOURCE
        : SOURCE,
      now,
      entry.reason ?? null,
    ),
  );
}

export function demoPostInputs(
  spec: DemoAccountSpec,
  today: string,
  now: string,
): PostInput[] {
  return spec.postSpecs.map((postSpec) => {
    const day = addDays(today, postSpec.dayOffset);
    const stamp = new Date(`${day}T${String(postSpec.hour ?? 10).padStart(2, '0')}:00:00+08:00`).toISOString();
    return {
      accountId: spec.id,
      platform: spec.platform,
      remoteId: postSpec.remoteId,
      title: postSpec.title,
      url: postUrl(spec.platform, postSpec.remoteId),
      format: postSpec.format,
      status: postSpec.status,
      publishedAt: postSpec.status === 'published' ? stamp : null,
      scheduledAt: postSpec.status === 'scheduled' ? stamp : null,
      metrics: postSpec.metrics,
      collectedAt: now,
    };
  });
}

export function demoHistory(
  spec: DemoAccountSpec,
  today: string,
  days = 30,
): {
  day: string;
  followers: number;
  posts: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}[] {
  const points = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const day = addDays(today, -index);
    const progress = (days - index) / days;
    const jitter = index % 5 === 0 ? 14 : index % 3 === 0 ? -8 : 0;
    const followers = Math.round(spec.followers - spec.followerDelta * (1 - progress)) + jitter;
    points.push({
      day,
      followers,
      posts: spec.posts === null ? null : Math.max(0, Math.round(spec.posts - (1 - progress) * 6)),
      views: null,
      likes: null,
      comments: null,
      shares: null,
      saves: null,
    });
  }
  return points;
}

export interface DemoPlanSpec {
  title: string;
  notes: string;
  contentType: ContentType;
  format: Format;
  dayOffset: number | null;
  targets: { platform: Platform; accountId: string | null }[];
  tags: string[];
  publicationRemoteIds?: string[];
}

export function demoPlans(): DemoPlanSpec[] {
  return [
    {
      title: 'BPhO 2024 Round 1 — full walkthrough',
      notes: 'Long paper walkthrough with chapter markers. Published on both long-form channels. #bpho #paper-walkthrough',
      contentType: 'paper_walkthrough',
      format: 'video',
      dayOffset: -5,
      targets: [
        { platform: 'bilibili', accountId: null },
        { platform: 'youtube', accountId: null },
      ],
      tags: ['bpho', 'paper-walkthrough'],
      publicationRemoteIds: ['bv-bpho-2024', 'yt-bpho-2024'],
    },
    {
      title: 'Moment of inertia in 60 seconds',
      notes: 'Short question video. Same clip cross-posted. #mechanics',
      contentType: 'question_video',
      format: 'video',
      dayOffset: -2,
      targets: [
        { platform: 'douyin', accountId: 'demo-douyin-main' },
        { platform: 'xiaohongshu', accountId: 'demo-xiaohongshu-main' },
      ],
      tags: ['mechanics'],
      publicationRemoteIds: ['dy-main-moment', 'xhs-moment'],
    },
    {
      title: 'Circular motion: the mistake everyone makes',
      notes: 'Short lecture with the classic v²/r slip. Recorded Thursday.',
      contentType: 'short_lecture',
      format: 'video',
      dayOffset: 2,
      targets: [
        { platform: 'bilibili', accountId: null },
        { platform: 'youtube', accountId: null },
      ],
      tags: ['mechanics', 'circular-motion'],
    },
    {
      title: 'Rotational dynamics — exam questions',
      notes: 'Chapter 8 question set. Use the whiteboard shot from last week.',
      contentType: 'paper_walkthrough',
      format: 'video',
      dayOffset: 4,
      targets: [{ platform: 'bilibili', accountId: 'demo-bilibili-main' }],
      tags: ['mechanics', 'a-level'],
    },
    {
      title: 'A-Level electric fields: 6 mark checklist',
      notes: 'Text card set. Keep the mark scheme wording exact. #alevel #electricity',
      contentType: 'text_guide',
      format: 'print',
      dayOffset: 1,
      targets: [{ platform: 'xiaohongshu', accountId: 'demo-xiaohongshu-main' }],
      tags: ['a-level', 'electricity'],
    },
    {
      title: 'Choosing between AS and A2 mechanics',
      notes: 'Short explainer for students picking next year. #as #a2',
      contentType: 'exam_info',
      format: 'print',
      dayOffset: 6,
      targets: [{ platform: 'xiaohongshu', accountId: null }],
      tags: ['as', 'a2'],
    },
    {
      title: 'Why we count in radians',
      notes: 'Shared with the Shorts account too. Scheduled on YouTube and Bilibili.',
      contentType: 'short_lecture',
      format: 'video',
      dayOffset: 9,
      targets: [
        { platform: 'bilibili', accountId: 'demo-bilibili-main' },
        { platform: 'youtube', accountId: 'demo-youtube-main' },
      ],
      tags: ['trigonometry'],
    },
    {
      title: 'Half-term revision plan',
      notes: '公众号 article with the week-by-week plan and the mock paper list.',
      contentType: 'text_guide',
      format: 'print',
      dayOffset: 3,
      targets: [{ platform: 'wechat', accountId: null }],
      tags: ['revision'],
    },
    {
      title: '2026 competition calendar',
      notes: 'BPhO, PhysicsBowl, AS challenge dates. Needs the verified dates before publishing. #bpho #physicsbowl',
      contentType: 'exam_info',
      format: 'print',
      dayOffset: 12,
      targets: [{ platform: 'xiaohongshu', accountId: null }],
      tags: ['bpho', 'physicsbowl'],
    },
    {
      title: 'Redshift without the maths',
      notes: 'Idea: one diagram, one analogy, then the observer frame. No date yet.',
      contentType: 'short_lecture',
      format: 'video',
      dayOffset: null,
      targets: [
        { platform: 'bilibili', accountId: null },
        { platform: 'youtube', accountId: null },
      ],
      tags: ['astrophysics'],
    },
    {
      title: 'Marking a 6-mark derivation',
      notes: 'Show the mark scheme, then re-mark a real script line by line.',
      contentType: 'paper_walkthrough',
      format: 'video',
      dayOffset: null,
      targets: [{ platform: 'bilibili', accountId: null }],
      tags: ['a-level', 'exams'],
    },
  ];
}

export interface DemoMergeSpec {
  title: string;
  remoteIds: string[];
}

export function demoMerges(): DemoMergeSpec[] {
  return [
    {
      title: 'Why a heavier ball does not fall faster',
      remoteIds: ['dy-main-heavier', 'dy-shorts-heavier', 'xhs-heavier'],
    },
    {
      title: 'AP Physics 1 FRQ walkthrough',
      remoteIds: ['bv-ap-frq', 'yt-ap-frq'],
    },
    {
      title: 'Why we count in radians',
      remoteIds: ['bv-radians', 'yt-radians'],
    },
  ];
}

export function demoTodos(): { title: string; done: boolean }[] {
  return [
    { title: 'Connect the second Douyin account', done: false },
    { title: 'Review the 公众号 scheduled-post collector', done: false },
    { title: 'Link the BPhO recording to the calendar plan', done: true },
    { title: 'Decide whether dark mode ships in v1', done: false },
    { title: 'Back up the old workspace database', done: true },
  ];
}

export function demoGeneratedAt(now = new Date()): string {
  return now.toISOString();
}

export function demoNow(): string {
  return isoNow();
}

function postUrl(platform: Platform, remoteId: string): string {
  switch (platform) {
    case 'douyin':
      return `https://www.douyin.com/video/${remoteId}`;
    case 'xiaohongshu':
      return `https://www.xiaohongshu.com/explore/${remoteId}`;
    case 'wechat':
      return `https://mp.weixin.qq.com/s/${remoteId}`;
    case 'bilibili':
      return `https://www.bilibili.com/video/${remoteId}`;
    case 'youtube':
      return `https://www.youtube.com/watch?v=${remoteId}`;
  }
}
