import { describe, expect, it } from 'vitest';
import appHtmlSource from '../app.html?raw';
import robotsSource from '../../static/robots.txt?raw';
import sitemapSource from '../../static/sitemap.xml?raw';
import rootLayoutSource from './+layout.svelte?raw';
import homeSource from './+page.svelte?raw';
import adminSource from './admin/+page.svelte?raw';
import joinTokenSource from './join/[token]/+page.svelte?raw';
import joinSource from './join/+page.svelte?raw';
import offlineMapsSource from './offline-maps/+page.svelte?raw';
import projectExportSource from './projects/[id]/export/+page.svelte?raw';
import projectSource from './projects/[id]/+page.svelte?raw';
import projectProfilesSource from './projects/[id]/profiles/+page.svelte?raw';
import projectTrackSource from './projects/[id]/track/+page.svelte?raw';
import newProjectSource from './projects/new/+page.svelte?raw';
import privacySource from './privacy/+page.svelte?raw';
import privacyOptionsSource from './privacy/+page.ts?raw';
import tutorialsSource from './tutorials/+page.svelte?raw';
import tutorialsOptionsSource from './tutorials/+page.ts?raw';
import welcomeSource from './welcome/+page.svelte?raw';
import welcomeOptionsSource from './welcome/+page.ts?raw';

const titledSources = [
	['home', homeSource],
	['admin', adminSource],
	['join', joinSource],
	['join token', joinTokenSource],
	['offline maps', offlineMapsSource],
	['project', projectSource],
	['project export', projectExportSource],
	['project profiles', projectProfilesSource],
	['project track', projectTrackSource],
	['new project', newProjectSource],
	['tutorials', tutorialsSource],
	['welcome', welcomeSource]
] as const;

const publicSeoSources = [
	['welcome', welcomeSource],
	['tutorials', tutorialsSource],
	['privacy', privacySource]
] as const;

const publicOptionSources = [
	['welcome', welcomeOptionsSource],
	['tutorials', tutorialsOptionsSource],
	['privacy', privacyOptionsSource]
] as const;

const noindexSources = [
	['home', homeSource],
	['admin', adminSource],
	['join', joinSource],
	['join token', joinTokenSource],
	['offline maps', offlineMapsSource],
	['project', projectSource],
	['project export', projectExportSource],
	['project profiles', projectProfilesSource],
	['project track', projectTrackSource],
	['new project', newProjectSource]
] as const;

describe('browser page titles', () => {
	it('declares default marketing metadata in the non-JS app shell', () => {
		expect(appHtmlSource).toContain('<title>Geonest | Field mapping for Android and web</title>');
		expect(appHtmlSource).toContain('<meta name="description" content="');
		expect(appHtmlSource).toContain('Capture GPS points, areas and routes');
	});

	it('publishes a sitemap for public pages', () => {
		expect(robotsSource).toContain('Sitemap: https://example.com/sitemap.xml');
		expect(robotsSource).toContain('Disallow: /admin');
		expect(robotsSource).toContain('Disallow: /projects');
		expect(robotsSource).toContain('Disallow: /join');
		expect(robotsSource).toContain('Disallow: /offline-maps');
		expect(sitemapSource).toContain('<loc>https://example.com/welcome</loc>');
		expect(sitemapSource).toContain('<loc>https://example.com/tutorials</loc>');
		expect(sitemapSource).toContain('<loc>https://example.com/privacy</loc>');
		expect(sitemapSource).toContain('Replace example.com before deploying');
		expect(sitemapSource).not.toContain('/admin');
		expect(sitemapSource).not.toContain('/projects');
	});

	it('declares a default app title in the root layout', () => {
		expect(rootLayoutSource).toContain('<title>{m.app_title()}</title>');
	});

	it.each(titledSources)('%s route declares a localized browser title', (_, source) => {
		expect(source).toContain('<svelte:head>');
		expect(source).toMatch(/<title>[\s\S]*m\.[a-z0-9_]+\([\s\S]*<\/title>/);
		expect(source).toContain('</title>');
	});

	it.each(publicSeoSources)('%s route declares discoverability metadata', (_, source) => {
		expect(source).toContain('<meta name="description"');
		expect(source).toContain('<link rel="canonical"');
		expect(source).toContain('<meta property="og:title"');
		expect(source).toContain('<meta property="og:description"');
		expect(source).toContain('<meta property="og:url"');
		expect(source).toContain('<meta name="twitter:card"');
	});

	it.each(publicOptionSources)('%s route opts into SSR for initial HTML metadata', (_, source) => {
		expect(source).toContain('export const ssr = true;');
	});

	it.each(noindexSources)('%s route opts out of search indexing', (_, source) => {
		expect(source).toContain('<meta name="robots" content="noindex, nofollow" />');
	});
});
