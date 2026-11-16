import { notFound, redirect } from "next/navigation";
import { ClubManagePost } from "@/components/club-manage-post";
import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { isUuid } from "@/lib/http";

export const dynamic = "force-dynamic";

export default async function ManagePostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  const sql = getDatabase();
  if (!sql) notFound();
  const [post] = await sql`
    select title, description from knitplot_club_public_posts
    where id = ${id}::uuid and creator_id = ${viewer.id}
  `;
  if (!post) notFound();
  return (
    <>
      <header className="library-heading">
        <h1>Manage post</h1>
      </header>
      <ClubManagePost
        id={id}
        title={post.title}
        description={post.description}
      />
    </>
  );
}
