import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSubmitFeedback } = vi.hoisted(() => ({
	mockSubmitFeedback: vi.fn()
}));

vi.mock('$env/dynamic/public', () => ({
	env: {}
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$lib/data/feedback', () => ({
	submitFeedback: mockSubmitFeedback
}));

import Page from './+page.svelte';

beforeEach(() => {
	vi.clearAllMocks();
	mockSubmitFeedback.mockResolvedValue({ attachment: 'none' });
});

describe('feedback page', () => {
	it('warns that an attached screenshot can contain visible location information', () => {
		render(Page);

		expect(screen.getByText(/screenshots may include information visible on your screen/i)).toBeTruthy();
	});

	it('renders feedback types as radio-backed shared pill controls', () => {
		const { container } = render(Page);

		expect(screen.getByRole('radio', { name: 'Bug' })).toBeTruthy();
		expect(screen.getByRole('radio', { name: 'Suggestion' })).toBeTruthy();
		expect(screen.getByRole('radio', { name: 'Other' })).toBeTruthy();
		expect(container.querySelector('.pill-toggle')).toBeTruthy();
		expect(container.querySelectorAll('.pill-btn')).toHaveLength(3);
	});

	it('shows a localized validation error for an empty message', async () => {
		const { container } = render(Page);
		const form = container.querySelector('form');
		expect(form).toBeTruthy();

		await fireEvent.submit(form as HTMLFormElement);

		expect((await screen.findByRole('alert')).textContent).toContain('Please enter a message.');
		expect(mockSubmitFeedback).not.toHaveBeenCalled();
	});

	it('shows the normal success state after feedback is saved', async () => {
		render(Page);
		await fireEvent.input(screen.getByLabelText('Your message'), {
			target: { value: 'The map is blank' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

		expect(await screen.findByText('Thanks! Your feedback was sent.')).toBeTruthy();
		expect(screen.queryByText(/screenshot couldn't be attached/i)).toBeNull();
	});

	it('keeps the success state and warns when only the screenshot fails', async () => {
		mockSubmitFeedback.mockResolvedValue({ attachment: 'failed' });
		render(Page);
		const screenshot = new File(['image'], 'screen.png', { type: 'image/png' });

		await fireEvent.click(screen.getByRole('radio', { name: 'Suggestion' }));
		await fireEvent.input(screen.getByLabelText('Your message'), {
			target: { value: 'Please add contours' }
		});
		await fireEvent.input(screen.getByLabelText('Email (optional)'), {
			target: { value: 'user@example.test' }
		});
		await fireEvent.change(screen.getByLabelText('Attach a screenshot (optional)'), {
			target: { files: [screenshot] }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

		expect(await screen.findByText('Thanks! Your feedback was sent.')).toBeTruthy();
		expect(
			await screen.findByText("The screenshot couldn't be attached. Your feedback was still sent.")
		).toBeTruthy();
		expect(mockSubmitFeedback).toHaveBeenCalledWith({
			type: 'suggestion',
			message: 'Please add contours',
			email: 'user@example.test',
			screenshot
		});
	});
});
