import { useMemo, type CSSProperties } from 'react';
import {
  DEFAULT_POST_CALENDAR_WEEKS,
  buildPostCalendar,
  formatDay,
} from '@creator-center/shared';
import type { Post } from '@creator-center/shared';
import { cn } from '../utils';

export function PostCalendar({
  posts,
  color,
  today,
  weeks = DEFAULT_POST_CALENDAR_WEEKS,
}: {
  posts: Post[];
  color: string;
  today: string;
  weeks?: number;
}) {
  const calendar = useMemo(
    () => buildPostCalendar({ posts, today, weeks }),
    [posts, today, weeks],
  );
  const monthLabels = calendar.weeks.map((week, index) => {
    const monday = week.days[0]?.day ?? calendar.start;
    const previous = calendar.weeks[index - 1]?.days[0]?.day;
    const changed = index === 0 || formatDay(monday, { month: 'short' }) !== formatDay(previous ?? monday, { month: 'short' });
    return { monday, label: changed ? formatDay(monday, { month: 'short' }) : '' };
  });
  return (
    <div
      className="post-calendar"
      role="group"
      aria-label={`Posting activity over the last ${weeks} weeks: ${calendar.posts} posts on ${calendar.activeDays} days`}
      style={{ '--calendar-color': color } as CSSProperties}
    >
      <div className="post-calendar-months" aria-hidden="true">
        {monthLabels.map((month) => (
          <span className="post-calendar-month" key={month.monday}>
            {month.label}
          </span>
        ))}
      </div>
      <div className="post-calendar-body">
        <div className="post-calendar-weekdays" aria-hidden="true">
          {['Mon', '', 'Wed', '', 'Fri', '', ''].map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
        <div className="post-calendar-weeks">
          {calendar.weeks.map((week) => (
            <div className="post-calendar-week" key={week.days[0]?.day}>
              {week.days.map((day) => (
                <span
                  key={day.day}
                  className={cn(
                    'post-calendar-cell',
                    `is-level-${day.level}`,
                    day.future && 'is-future',
                  )}
                  title={`${formatDay(day.day, { weekday: 'short', month: 'short', day: 'numeric' })} · ${
                    day.count === 0 ? 'No posts' : `${day.count} post${day.count === 1 ? '' : 's'}`
                  }`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="post-calendar-foot">
        <span>
          {calendar.posts} post{calendar.posts === 1 ? '' : 's'} · {calendar.activeDays} day
          {calendar.activeDays === 1 ? '' : 's'}
        </span>
        <span className="post-calendar-legend" aria-hidden="true">
          Less
          <span className="post-calendar-cell is-level-0" />
          <span className="post-calendar-cell is-level-1" />
          <span className="post-calendar-cell is-level-2" />
          <span className="post-calendar-cell is-level-3" />
          More
        </span>
      </div>
    </div>
  );
}
