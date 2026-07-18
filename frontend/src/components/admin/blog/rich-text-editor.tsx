"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link2,
  ImagePlus,
  Undo2,
  Redo2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/upload-client";
import { useToast } from "@/components/admin/ui/toaster";

function Btn({
  active,
  onClick,
  title,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-8 place-items-center rounded-md text-body transition-colors hover:bg-surface hover:text-ink disabled:opacity-40",
        active && "bg-brand-tint text-brand",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onPickImage(file: File) {
    setUploading(true);
    try {
      const url = await uploadFile(file, "cover");
      editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function addLink() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-hairline bg-surface/40 p-1.5">
      <Btn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </Btn>
      <Btn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" />
      </Btn>
      <span className="mx-1 h-5 w-px bg-hairline" />
      <Btn title="Heading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="size-4" />
      </Btn>
      <Btn title="Subheading" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="size-4" />
      </Btn>
      <Btn title="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="size-4" />
      </Btn>
      <Btn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </Btn>
      <Btn title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </Btn>
      <span className="mx-1 h-5 w-px bg-hairline" />
      <Btn title="Link" active={editor.isActive("link")} onClick={addLink}>
        <Link2 className="size-4" />
      </Btn>
      <Btn title="Insert image" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
      </Btn>
      <span className="mx-1 h-5 w-px bg-hairline" />
      <Btn title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 className="size-4" />
      </Btn>
      <Btn title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 className="size-4" />
      </Btn>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPickImage(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** WYSIWYG body editor (tiptap). Emits sanitizable HTML; images upload straight
 *  to R2 via the shared uploader, so authors never paste URLs. */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write the article…",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false, // App Router SSR safety
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Image.configure({ HTMLAttributes: { class: "rounded-lg" } }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "article-html min-h-[22rem] max-w-none px-4 py-3 focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Keep the editor in sync if the value is replaced programmatically (e.g. a
  // legacy markdown body converted to HTML on first load).
  useEffect(() => {
    if (editor && value && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-paper focus-within:border-brand">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
