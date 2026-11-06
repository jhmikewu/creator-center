// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RecordingWorkflow } from '@creator-center/shared';
import { RecordingEditor } from './RecordingEditor';
import { RecordingProgress } from '../components/RecordingProgress';
import { Modal } from '../components/ui';
import { api } from '../api';

vi.mock('../api', () => ({
  api: {
    recording: vi.fn(),
    mediaLinkOptions: vi.fn(),
    recordingProgress: vi.fn(),
    mediaFileUrl: (id: string) => `/media/${id}`,
    saveRecording: vi.fn(),
  },
}));

const workflow: RecordingWorkflow = {
  primary: 'mov',
  secondary: 'ipad',
  primaryMp4: 'primary',
  secondaryMp4: 'secondary',
  duration: 10,
  secondaryDuration: 10,
  offset: 0,
  claps: [2, 6],
  secondaryClaps: [],
  sections: [
    { start: 0, end: 2, source: 'primary', output: 'Video 1' },
    { start: 2, end: 6, source: 'secondary', output: 'Video 1' },
    { start: 6, end: 10, source: 'primary', output: 'Video 1' },
  ],
  outputs: [],
};
beforeEach(() => {
  vi.mocked(api.recording).mockResolvedValue(structuredClone(workflow));
  vi.mocked(api.mediaLinkOptions).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const settleFocus = () => act(() => new Promise((resolve) => setTimeout(resolve, 60)));

describe('recording editing', () => {
  it('keeps focus on a later boundary while typing and saves its value', async () => {
    const user = userEvent.setup();
    vi.mocked(api.saveRecording).mockResolvedValue(workflow);
    render(<RecordingEditor id="project" onClose={() => {}} onChanged={() => {}} />);
    const input = await screen.findByLabelText('Section 2 start');
    await settleFocus();
    await user.clear(input);
    await user.type(input, '2.25');
    await settleFocus();
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe('2.25');
    await user.click(screen.getByText('Save edits'));
    expect(api.saveRecording).toHaveBeenCalledWith(
      'project',
      [workflow.sections[0], { ...workflow.sections[1], start: 2.25 }, workflow.sections[2]],
      0,
    );
  });

  it('cuts at the preview playhead and assigns outputs from a select', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RecordingEditor id="project" onClose={() => {}} onChanged={() => {}} />,
    );
    await screen.findByLabelText('Section 1 start');
    expect((screen.getByText(/Cut at playhead/) as HTMLButtonElement).disabled).toBe(true);
    const primary = container.ownerDocument.querySelector('video')!;
    primary.currentTime = 0.7;
    fireEvent.timeUpdate(primary);
    await user.click(screen.getByText('Cut at playhead (0.70s)'));
    expect((screen.getByLabelText('Section 1 end') as HTMLInputElement).value).toBe('0.7');
    expect((screen.getByLabelText('Section 2 start') as HTMLInputElement).value).toBe('0.7');
    expect((screen.getByLabelText('Section 2 end') as HTMLInputElement).value).toBe('2');
    await user.selectOptions(screen.getByLabelText('Section 2 output'), '__new_video__');
    expect((screen.getByLabelText('Section 2 output') as HTMLSelectElement).value).toBe('Video 2');
    await user.selectOptions(screen.getByLabelText('Section 3 output'), 'Video 2');
    expect((screen.getByLabelText('Section 3 output') as HTMLSelectElement).value).toBe('Video 2');
    await user.selectOptions(screen.getByLabelText('Section 2 source'), 'drop');
    expect((screen.getByLabelText('Section 2 output') as HTMLSelectElement).disabled).toBe(true);
  });

  it('uses the latest close callback without refocusing the modal', async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(
      <Modal open title="Test" onClose={first}>
        <input aria-label="First" />
        <input aria-label="Second" />
      </Modal>,
    );
    await settleFocus();
    screen.getByLabelText('Second').focus();
    rerender(
      <Modal open title="Test" onClose={latest}>
        <input aria-label="First" />
        <input aria-label="Second" />
      </Modal>,
    );
    await settleFocus();
    expect(document.activeElement).toBe(screen.getByLabelText('Second'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });
});

it('shows measured stage progress and an indeterminate bar while copying', async () => {
  vi.mocked(api.recordingProgress).mockResolvedValue({
    stage: 'Converting primary to MP4',
    percent: 37,
  });
  const { rerender } = render(<RecordingProgress projectId="project" />);
  await waitFor(() => expect(screen.getByRole('progressbar').getAttribute('value')).toBe('37'));
  expect(screen.getByText('37%')).toBeTruthy();
  rerender(<RecordingProgress projectId={null} fallback="Copying media" />);
  expect(screen.getByRole('progressbar').hasAttribute('value')).toBe(false);
  expect(screen.getByText('Copying media')).toBeTruthy();
});
