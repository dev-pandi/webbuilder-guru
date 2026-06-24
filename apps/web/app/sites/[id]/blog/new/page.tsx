"use client";

import { useParams } from "next/navigation";
import { BlogForm } from "../BlogForm";

export default function NewBlogPostPage() {
  const params = useParams<{ id: string }>();
  return <BlogForm siteId={params.id} post={null} />;
}
