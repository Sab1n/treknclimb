'use client';

import type { FaqRow } from '../../../types/tripEditor';
import { newRowKey } from '../../../types/tripEditor';
import { RepeatableList, AddRowButton, updateRow } from './RepeatableList';
import { TextField, TextAreaField } from '../fields';

/**
 * Trip FAQs.
 *
 * These are embedded in the Trip document, not the separate `Faqs` collection —
 * a trip's FAQs are about that trip and travel with it.
 *
 * They also become `FAQPage` structured data on the trip page, which is why the
 * order is editable: the markup is emitted in this order, and Google reads the
 * first entries as the most representative. It is also why both fields are
 * required — an empty answer would emit a `FAQPage` entry with no
 * `acceptedAnswer`, which is invalid structured data rather than merely an
 * unfinished page.
 */
export default function FaqEditor({
  faqs,
  onChange,
  errors,
}: {
  faqs: FaqRow[];
  onChange: (faqs: FaqRow[]) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="font-display text-base font-extrabold tracking-display">
          Frequently asked questions
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Shown on the trip page and emitted as FAQPage structured data, in this
          order. Answer the objections that stop someone sending the form.
        </p>
      </div>

      <RepeatableList
        rows={faqs}
        onChange={onChange}
        label="Trip FAQs"
        rowLabel={(faq, index) =>
          faq.question.trim() !== '' ? faq.question : `Question ${index + 1}`
        }
        empty={<>No questions yet.</>}
      >
        {(faq, index) => (
          <div className="flex flex-col gap-4">
            <TextField
              label="Question"
              id={`faq-${faq.key}-question`}
              required
              value={faq.question}
              onChange={(value) =>
                onChange(updateRow(faqs, faq.key, { question: value }))
              }
              error={errors[`faqs.${index}.question`]}
              placeholder="Do I need previous trekking experience?"
            />

            <TextAreaField
              label="Answer"
              id={`faq-${faq.key}-answer`}
              required
              rows={4}
              value={faq.answer}
              onChange={(value) =>
                onChange(updateRow(faqs, faq.key, { answer: value }))
              }
              error={errors[`faqs.${index}.answer`]}
            />
          </div>
        )}
      </RepeatableList>

      <AddRowButton onClick={() =>
        onChange([...faqs, { key: newRowKey('faq'), question: '', answer: '' }])
      }>
        Add a question
      </AddRowButton>
    </div>
  );
}
