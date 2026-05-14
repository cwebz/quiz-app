"use client";

import { useState } from "react";
import { QuestionEditModal, type EditableQuestion } from "./QuestionEditModal";

type Props = {
  question: EditableQuestion;
};

export function QuestionEditButton({ question }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="admin-btn ghost"
        onClick={() => setOpen(true)}
        title="Edit question"
      >
        Edit
      </button>
      {open && (
        <QuestionEditModal
          question={question}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
