/**
 * The one publish-status vocabulary, shared by every model that has one:
 * Trip, BlogPost, Testimonial, Faq.
 *
 * One vocabulary means one admin status component and one sitemap/noindex rule
 * instead of a per-model dialect. `archived` rather than deletion matters
 * across all four — content gets retired from the site without losing the
 * record.
 */
export const PUBLISH_STATUSES = ['draft', 'published', 'archived'] as const;

export type PublishStatus = (typeof PUBLISH_STATUSES)[number];
